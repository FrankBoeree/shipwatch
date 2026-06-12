from __future__ import annotations

import base64
import os
import statistics
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import psycopg
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware


DATABASE_URL = os.getenv("DATABASE_URL")
PHOTO_DIR = Path(os.getenv("PHOTO_DIR", "/data/photos"))
MODEL_PATH = os.getenv("YOLO_MODEL", "/models/yolov5n.onnx")
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.45"))
NMS_THRESHOLD = float(os.getenv("NMS_THRESHOLD", "0.45"))
MIN_TRACK_FRAMES = int(os.getenv("MIN_TRACK_FRAMES", "3"))
# Tracks that leave the frame before meeting the normal criteria still register
# once they have at least this many observations (fast ships, partial views).
FALLBACK_MIN_TRACK_FRAMES = int(os.getenv("FALLBACK_MIN_TRACK_FRAMES", "2"))
TRACK_MAX_DISTANCE = float(os.getenv("TRACK_MAX_DISTANCE", "150"))
TRACK_TTL_SECONDS = float(os.getenv("TRACK_TTL_SECONDS", "4"))
REGISTERED_TRACK_TTL_SECONDS = float(os.getenv("REGISTERED_TRACK_TTL_SECONDS", "45"))
MIN_TRACK_DISPLACEMENT = float(os.getenv("MIN_TRACK_DISPLACEMENT", "45"))
CENTER_ZONE_X = os.getenv("CENTER_ZONE_X", "0.1,0.9")
CENTER_ZONE_Y = os.getenv("CENTER_ZONE_Y", "0.35,0.95")
PASSAGE_COOLDOWN_SECONDS = float(os.getenv("PASSAGE_COOLDOWN_SECONDS", "60"))
# Max distance between a candidate track and the constant-velocity prediction of
# a recently registered passage before the candidate counts as a duplicate.
PASSAGE_DUPLICATE_DISTANCE = float(os.getenv("PASSAGE_DUPLICATE_DISTANCE", "130"))
TRACK_MATCH_MIN_SCORE = float(os.getenv("TRACK_MATCH_MIN_SCORE", "0.15"))
# Number of recent track points used to estimate velocity (ships move at a
# fairly constant speed, so an average over several points is robust to noise).
VELOCITY_WINDOW = int(os.getenv("VELOCITY_WINDOW", "6"))
# A ship counts as fully visible when its bbox stays this fraction of the frame
# size away from every frame edge.
EDGE_MARGIN_RATIO = float(os.getenv("EDGE_MARGIN_RATIO", "0.015"))
# A bbox clear of the edges is not enough: while a ship is still entering the
# frame (or emerging from behind an obstruction) the detector draws a box
# around only the visible part, and that box grows every frame. The ship only
# counts as fully in view once its bbox width has been stable for a window of
# consecutive observations.
SIZE_STABLE_WINDOW = int(os.getenv("SIZE_STABLE_WINDOW", "4"))
SIZE_STABLE_TOLERANCE = float(os.getenv("SIZE_STABLE_TOLERANCE", "0.10"))
DETECTION_MODE = os.getenv("DETECTION_MODE", "yolo")
SHIP_CLASS_NAMES = {"boat", "ship"}
MOTION_MIN_AREA = int(os.getenv("MOTION_MIN_AREA", "4500"))
REGISTER_MOTION_PASSAGES = os.getenv("REGISTER_MOTION_PASSAGES", "false").lower() == "true"
# Cargo ships are far longer than they are high; sailboats (mast) are higher
# than they are long. Everything in between stays "other".
CARGO_MIN_ASPECT_RATIO = float(os.getenv("CARGO_MIN_ASPECT_RATIO", "3.0"))
SAILBOAT_MAX_ASPECT_RATIO = float(os.getenv("SAILBOAT_MAX_ASPECT_RATIO", "0.9"))
# YOLO often recognises only part of a long, flat-hulled vessel (the wheelhouse
# or bow) as a boat. The whole hull moves though, so motion regions on the same
# horizontal band that touch the YOLO box are used to stretch it along the
# vessel, and multiple partial detections of the same vessel are merged.
MOTION_EXTENSION_ENABLED = os.getenv("MOTION_EXTENSION_ENABLED", "true").lower() == "true"
MOTION_EXTENSION_MIN_AREA = int(os.getenv("MOTION_EXTENSION_MIN_AREA", "400"))
# Max vertical growth (fraction of original bbox height per side) when motion
# regions stretch a box; keeps wakes and reflections from inflating the height.
MOTION_EXTENSION_MAX_HEIGHT_GROWTH = float(os.getenv("MOTION_EXTENSION_MAX_HEIGHT_GROWTH", "0.5"))
# Boxes on the same band closer together than this fraction of the frame width
# are considered parts of the same vessel.
SHIP_MERGE_MAX_GAP_RATIO = float(os.getenv("SHIP_MERGE_MAX_GAP_RATIO", "0.05"))
SHIP_MERGE_MIN_VERTICAL_OVERLAP = float(os.getenv("SHIP_MERGE_MIN_VERTICAL_OVERLAP", "0.35"))
PHOTO_JPEG_QUALITY = int(os.getenv("PHOTO_JPEG_QUALITY", "82"))
SHIP_TYPES = ("cargo", "sailboat", "other", "unknown")
SHIP_TYPE_LABELS = {
    "cargo": "Vrachtschip",
    "sailboat": "Zeilboot",
    "pleasure_craft": "Pleziervaart",
    "other": "Overig",
    "unknown": "Onbekend",
}

PHOTO_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="IJ Ship Tracker Detector")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CAPTURE_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@dataclass
class Detection:
    label: str
    confidence: float
    bbox: tuple[int, int, int, int]


@dataclass
class Track:
    id: str
    camera_id: str
    first_seen: float
    last_seen: float
    points: list[tuple[float, float]] = field(default_factory=list)
    point_times: list[float] = field(default_factory=list)
    # Bbox width per observation, used to detect when the ship stops "growing"
    # (i.e. has fully entered the frame).
    width_history: list[float] = field(default_factory=list)
    # Aspect ratios sampled only from fully visible, size-stable bboxes.
    aspect_samples: list[float] = field(default_factory=list)
    best_confidence: float = 0
    best_center_score: float = 0
    # Best frame in which the ship is *fully* visible.
    best_frame_quality: float = 0
    best_frame: np.ndarray | None = None
    best_bbox: tuple[int, int, int, int] | None = None
    # Best frame overall, used as fallback when the ship is never fully visible.
    fallback_frame_quality: float = 0
    fallback_frame: np.ndarray | None = None
    fallback_bbox: tuple[int, int, int, int] | None = None
    last_bbox: tuple[int, int, int, int] | None = None
    registered: bool = False


@dataclass
class RecentPassage:
    registered_at: float
    direction: str
    exit_x: float
    exit_y: float
    velocity_x: float
    velocity_y: float


tracks: dict[str, Track] = {}
recent_passages: list[RecentPassage] = []
backgrounds: dict[str, np.ndarray] = {}
model: cv2.dnn.Net | None = None

COCO_CLASS_NAMES = [
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat",
    "traffic light", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat",
    "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack",
    "umbrella", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball",
    "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket",
    "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple",
    "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake",
    "chair", "couch", "potted plant", "bed", "dining table", "toilet", "tv", "laptop",
    "mouse", "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink",
    "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier",
    "toothbrush",
]


def get_model():
    global model

    if DETECTION_MODE != "yolo":
        return None

    if model is None and Path(MODEL_PATH).exists():
        model = cv2.dnn.readNetFromONNX(MODEL_PATH)
        model.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
        model.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)

    return model


def decode_frame(contents: bytes) -> np.ndarray:
    data = np.frombuffer(contents, dtype=np.uint8)
    frame = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if frame is None:
        raise ValueError("Frame could not be decoded")
    return frame


def in_roi(center_x: float, center_y: float, width: int, height: int) -> bool:
    roi = os.getenv("WATER_ROI", "0,0.35,1,1")
    left, top, right, bottom = [float(part) for part in roi.split(",")]
    return left * width <= center_x <= right * width and top * height <= center_y <= bottom * height


def vertical_overlap_ratio(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> float:
    top = max(a[1], b[1])
    bottom = min(a[3], b[3])
    if bottom <= top:
        return 0.0
    height_a = max(1, a[3] - a[1])
    height_b = max(1, b[3] - b[1])
    return (bottom - top) / min(height_a, height_b)


def horizontal_gap(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> float:
    """Pixels between two boxes horizontally; 0 when they overlap."""
    if a[0] > b[2]:
        return float(a[0] - b[2])
    if b[0] > a[2]:
        return float(b[0] - a[2])
    return 0.0


def motion_regions(camera_id: str, frame: np.ndarray) -> list[tuple[int, int, int, int]]:
    """Small-grain moving regions, used to stretch YOLO boxes along a hull."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (21, 21), 0)

    previous = backgrounds.get(camera_id)
    backgrounds[camera_id] = gray

    if previous is None:
        return []

    delta = cv2.absdiff(previous, gray)
    threshold = cv2.threshold(delta, 28, 255, cv2.THRESH_BINARY)[1]
    threshold = cv2.dilate(threshold, None, iterations=2)
    contours, _ = cv2.findContours(threshold, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    regions: list[tuple[int, int, int, int]] = []
    for contour in contours:
        if cv2.contourArea(contour) < MOTION_EXTENSION_MIN_AREA:
            continue
        x, y, w, h = cv2.boundingRect(contour)
        regions.append((x, y, x + w, y + h))

    return regions


def extend_bbox_with_motion(
    bbox: tuple[int, int, int, int],
    regions: list[tuple[int, int, int, int]],
    width: int,
    height: int,
) -> tuple[int, int, int, int]:
    """Stretch a YOLO box along the vessel using adjacent motion regions.

    YOLO frequently boxes only the superstructure of a long flat hull. The
    whole hull moves coherently, so moving regions whose vertical center lies
    on the same band and that touch (or nearly touch) the box horizontally are
    absorbed. Vertical growth is capped so wakes don't inflate the height.
    """
    orig_x1, orig_y1, orig_x2, orig_y2 = bbox
    box_h = max(1, orig_y2 - orig_y1)
    band_top = orig_y1 - box_h * 0.3
    band_bottom = orig_y2 + box_h * 0.3
    min_y1 = orig_y1 - box_h * MOTION_EXTENSION_MAX_HEIGHT_GROWTH
    max_y2 = orig_y2 + box_h * MOTION_EXTENSION_MAX_HEIGHT_GROWTH
    max_gap = width * SHIP_MERGE_MAX_GAP_RATIO

    x1, y1, x2, y2 = orig_x1, orig_y1, orig_x2, orig_y2
    used: set[int] = set()
    changed = True
    while changed:
        changed = False
        for index, region in enumerate(regions):
            if index in used:
                continue
            region_cy = (region[1] + region[3]) / 2
            if not band_top <= region_cy <= band_bottom:
                continue
            if horizontal_gap((x1, y1, x2, y2), region) > max_gap:
                continue
            x1 = min(x1, region[0])
            x2 = max(x2, region[2])
            y1 = int(max(min(y1, region[1]), min_y1))
            y2 = int(min(max(y2, region[3]), max_y2))
            used.add(index)
            changed = True

    return (max(0, x1), max(0, y1), min(width, x2), min(height, y2))


def merge_ship_detections(detections: list[Detection], frame_width: int) -> list[Detection]:
    """Merge partial detections of the same vessel (bow, wheelhouse, stern)
    that sit on the same horizontal band close together."""
    max_gap = frame_width * SHIP_MERGE_MAX_GAP_RATIO
    merged = list(detections)
    changed = True
    while changed:
        changed = False
        for i in range(len(merged)):
            for j in range(i + 1, len(merged)):
                a, b = merged[i], merged[j]
                if (
                    vertical_overlap_ratio(a.bbox, b.bbox) >= SHIP_MERGE_MIN_VERTICAL_OVERLAP
                    and horizontal_gap(a.bbox, b.bbox) <= max_gap
                ):
                    union = (
                        min(a.bbox[0], b.bbox[0]),
                        min(a.bbox[1], b.bbox[1]),
                        max(a.bbox[2], b.bbox[2]),
                        max(a.bbox[3], b.bbox[3]),
                    )
                    merged[i] = Detection(
                        label=a.label,
                        confidence=max(a.confidence, b.confidence),
                        bbox=union,
                    )
                    del merged[j]
                    changed = True
                    break
            if changed:
                break

    return merged


def detect_ships(camera_id: str, frame: np.ndarray) -> list[Detection]:
    detector = get_model()

    if detector is None:
        return []

    blob = cv2.dnn.blobFromImage(frame, 1 / 255.0, (640, 640), swapRB=True, crop=False)
    detector.setInput(blob)
    outputs = detector.forward()
    detections: list[Detection] = []
    height, width = frame.shape[:2]
    rows = outputs[0]
    boxes: list[list[int]] = []
    confidences: list[float] = []
    labels: list[str] = []

    if rows.shape[0] < rows.shape[1]:
        rows = rows.T

    x_scale = width / 640
    y_scale = height / 640

    for row in rows:
        objectness = float(row[4])
        scores = row[5:]
        class_id = int(np.argmax(scores))
        class_score = float(scores[class_id])
        confidence = objectness * class_score

        if confidence < CONFIDENCE_THRESHOLD:
            continue

        label = COCO_CLASS_NAMES[class_id] if class_id < len(COCO_CLASS_NAMES) else str(class_id)
        if label not in SHIP_CLASS_NAMES:
            continue

        cx, cy, box_w, box_h = row[:4]
        x1 = int((cx - box_w / 2) * x_scale)
        y1 = int((cy - box_h / 2) * y_scale)
        x2 = int((cx + box_w / 2) * x_scale)
        y2 = int((cy + box_h / 2) * y_scale)
        center_x = (x1 + x2) / 2
        center_y = (y1 + y2) / 2

        if not in_roi(center_x, center_y, width, height):
            continue

        boxes.append([max(0, x1), max(0, y1), min(width, x2) - max(0, x1), min(height, y2) - max(0, y1)])
        confidences.append(confidence)
        labels.append(label)

    indexes = cv2.dnn.NMSBoxes(boxes, confidences, CONFIDENCE_THRESHOLD, NMS_THRESHOLD)
    for index in indexes:
        i = int(index)
        x, y, box_w, box_h = boxes[i]
        detections.append(
            Detection(label=labels[i], confidence=confidences[i], bbox=(x, y, x + box_w, y + box_h))
        )

    if detections and MOTION_EXTENSION_ENABLED:
        regions = motion_regions(camera_id, frame)
        detections = [
            Detection(
                label=item.label,
                confidence=item.confidence,
                bbox=extend_bbox_with_motion(item.bbox, regions, width, height),
            )
            for item in detections
        ]
    elif MOTION_EXTENSION_ENABLED:
        # Keep the motion background up to date even without detections, so the
        # frame diff is fresh the moment a ship appears.
        motion_regions(camera_id, frame)

    return merge_ship_detections(detections, width)


def detect_motion(camera_id: str, frame: np.ndarray) -> list[Detection]:
    height, width = frame.shape[:2]
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (21, 21), 0)

    previous = backgrounds.get(camera_id)
    backgrounds[camera_id] = gray

    if previous is None:
        return []

    delta = cv2.absdiff(previous, gray)
    threshold = cv2.threshold(delta, 28, 255, cv2.THRESH_BINARY)[1]
    threshold = cv2.dilate(threshold, None, iterations=2)
    contours, _ = cv2.findContours(threshold, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    boxes: list[tuple[int, int, int, int]] = []
    total_area = 0.0

    for contour in contours:
        area = cv2.contourArea(contour)
        if area < MOTION_MIN_AREA:
            continue

        x, y, w, h = cv2.boundingRect(contour)
        center_x = x + w / 2
        center_y = y + h / 2

        if not in_roi(center_x, center_y, width, height):
            continue

        boxes.append((x, y, x + w, y + h))
        total_area += area

    if not boxes:
        return []

    x1 = min(box[0] for box in boxes)
    y1 = min(box[1] for box in boxes)
    x2 = max(box[2] for box in boxes)
    y2 = max(box[3] for box in boxes)
    confidence = min(0.95, max(CONFIDENCE_THRESHOLD, total_area / float(width * height) * 8))

    return [Detection(label="motion_candidate", confidence=confidence, bbox=(x1, y1, x2, y2))]


def centroid(bbox: tuple[int, int, int, int]) -> tuple[float, float]:
    x1, y1, x2, y2 = bbox
    return ((x1 + x2) / 2, (y1 + y2) / 2)


def parse_zone(raw: str) -> tuple[float, float]:
    left, right = [float(part) for part in raw.split(",")]
    return left, right


CENTER_X_MIN, CENTER_X_MAX = parse_zone(CENTER_ZONE_X)
CENTER_Y_MIN, CENTER_Y_MAX = parse_zone(CENTER_ZONE_Y)


def bbox_iou(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)

    if inter_x2 <= inter_x1 or inter_y2 <= inter_y1:
        return 0.0

    inter_area = float((inter_x2 - inter_x1) * (inter_y2 - inter_y1))
    area_a = float(max(1, ax2 - ax1) * max(1, ay2 - ay1))
    area_b = float(max(1, bx2 - bx1) * max(1, by2 - by1))
    return inter_area / (area_a + area_b - inter_area)


def center_score(cx: float, cy: float, width: int, height: int) -> float:
    if width <= 0 or height <= 0:
        return 0.0

    norm_x = cx / width
    norm_y = cy / height
    target_x = (CENTER_X_MIN + CENTER_X_MAX) / 2
    target_y = (CENTER_Y_MIN + CENTER_Y_MAX) / 2
    x_span = max((CENTER_X_MAX - CENTER_X_MIN) / 2, 0.15)
    y_span = max((CENTER_Y_MAX - CENTER_Y_MIN) / 2, 0.12)

    x_score = max(0.0, 1.0 - abs(norm_x - target_x) / x_span)
    y_score = max(0.0, 1.0 - abs(norm_y - target_y) / y_span)
    return (x_score * 0.55) + (y_score * 0.45)


def frame_quality_score(center: float, confidence: float) -> float:
    return (center * 0.35) + (confidence * 0.65)


def is_fully_visible(bbox: tuple[int, int, int, int], width: int, height: int) -> bool:
    """True when the bbox keeps a margin to every frame edge (ship fully in view)."""
    margin_x = max(4.0, width * EDGE_MARGIN_RATIO)
    margin_y = max(4.0, height * EDGE_MARGIN_RATIO)
    x1, y1, x2, y2 = bbox
    return (
        x1 >= margin_x
        and y1 >= margin_y
        and x2 <= width - margin_x
        and y2 <= height - margin_y
    )


def size_is_stable(track: Track) -> bool:
    """True once the bbox width has stopped growing for a full window.

    A ship entering the frame (or emerging from behind an obstruction) shows a
    growing bbox around its visible part; only when the width settles do we
    know the whole ship is in view.
    """
    if len(track.width_history) < SIZE_STABLE_WINDOW:
        return False

    window = track.width_history[-SIZE_STABLE_WINDOW:]
    largest = max(window)
    if largest <= 0:
        return False
    return (largest - min(window)) / largest <= SIZE_STABLE_TOLERANCE


def track_velocity(track: Track) -> tuple[float, float]:
    """Average velocity (px/s) over the most recent points.

    Ships move at a fairly constant speed, so averaging over a window gives a
    stable estimate that survives single missed or jittery detections.
    """
    if len(track.points) < 2:
        return (0.0, 0.0)

    window = min(len(track.points), max(2, VELOCITY_WINDOW))
    x0, y0 = track.points[-window]
    t0 = track.point_times[-window]
    x1, y1 = track.points[-1]
    t1 = track.point_times[-1]
    dt = t1 - t0

    if dt <= 0:
        return (0.0, 0.0)

    return ((x1 - x0) / dt, (y1 - y0) / dt)


def predicted_centroid(track: Track, at_time: float) -> tuple[float, float]:
    cx, cy = track.points[-1]
    vx, vy = track_velocity(track)
    elapsed = max(0.0, at_time - track.point_times[-1])
    return (cx + vx * elapsed, cy + vy * elapsed)


def track_match_score(track: Track, detection: Detection, now: float) -> float:
    if not track.points:
        return 0.0

    cx, cy = centroid(detection.bbox)
    px, py = predicted_centroid(track, now)
    distance = float(np.hypot(cx - px, cy - py))
    # Allow a wider search radius after missed frames; the constant-velocity
    # prediction keeps the expected position accurate but noise accumulates.
    gap = max(0.0, now - track.point_times[-1])
    allowed = TRACK_MAX_DISTANCE * (1.0 + min(gap, 3.0) * 0.4)
    distance_score = max(0.0, 1.0 - distance / allowed)

    iou_score = bbox_iou(track.last_bbox, detection.bbox) if track.last_bbox else 0.0
    combined = (distance_score * 0.45) + (iou_score * 0.55)

    # Only a genuine geometric match qualifies; the registered bonus merely
    # gives priority so re-detections stick to the registered track instead of
    # spawning (and re-registering) a new one. A flat bonus must never push a
    # non-matching detection past the threshold, or a new ship entering the
    # frame would be absorbed by an old track and never recorded.
    if combined > TRACK_MATCH_MIN_SCORE and track.registered:
        combined += 0.2

    return combined


def prune_recent_passages(now: float) -> None:
    global recent_passages
    recent_passages = [
        item for item in recent_passages if now - item.registered_at <= PASSAGE_COOLDOWN_SECONDS
    ]


def is_duplicate_passage(track: Track) -> bool:
    """Check whether this track is the same ship as a recently registered passage.

    A re-acquired track (detection dropped out and came back) starts somewhere
    along the path of the original ship. Because ships sail at a fairly constant
    speed, we extrapolate each recent passage with its velocity and compare the
    candidate's first and last observation against the predicted positions.
    """
    now = time.time()
    prune_recent_passages(now)
    direction = direction_for(track)

    for item in recent_passages:
        if (
            direction != "unknown"
            and item.direction != "unknown"
            and item.direction != direction
        ):
            continue

        samples = (
            (track.points[0], track.point_times[0]),
            (track.points[-1], track.point_times[-1]),
        )
        matches = 0
        for (px, py), pt in samples:
            elapsed = pt - item.registered_at
            if elapsed < 0:
                continue
            pred_x = item.exit_x + item.velocity_x * elapsed
            pred_y = item.exit_y + item.velocity_y * elapsed
            if float(np.hypot(px - pred_x, py - pred_y)) <= PASSAGE_DUPLICATE_DISTANCE:
                matches += 1

        # Both observations must lie on the predicted trajectory, so a second
        # ship following at a distance is not suppressed.
        if matches == len(samples):
            return True

    return False


def remember_passage(track: Track) -> None:
    vx, vy = track_velocity(track)
    recent_passages.append(
        RecentPassage(
            registered_at=track.point_times[-1],
            direction=direction_for(track),
            exit_x=track.points[-1][0],
            exit_y=track.points[-1][1],
            velocity_x=vx,
            velocity_y=vy,
        )
    )


def assign_detections_to_tracks(
    camera_id: str,
    detections: list[Detection],
    now: float,
) -> list[tuple[Detection, Track | None]]:
    """Match detections to existing tracks globally so nearby ships don't swap IDs."""
    candidate_tracks = [
        track
        for track in tracks.values()
        if track.camera_id == camera_id and track.points
    ]

    scored_pairs: list[tuple[float, int, str]] = []
    for detection_index, detection in enumerate(detections):
        for track in candidate_tracks:
            score = track_match_score(track, detection, now)
            if score > TRACK_MATCH_MIN_SCORE:
                scored_pairs.append((score, detection_index, track.id))

    scored_pairs.sort(reverse=True)
    matched_detection_indexes: set[int] = set()
    matched_track_ids: set[str] = set()
    assignments: list[Track | None] = [None] * len(detections)

    for _, detection_index, track_id in scored_pairs:
        if detection_index in matched_detection_indexes or track_id in matched_track_ids:
            continue
        assignments[detection_index] = tracks[track_id]
        matched_detection_indexes.add(detection_index)
        matched_track_ids.add(track_id)

    return [(detections[index], assignments[index]) for index in range(len(detections))]


def bbox_aspect_ratio(bbox: tuple[int, int, int, int]) -> float:
    x1, y1, x2, y2 = bbox
    return max(1, x2 - x1) / max(1, y2 - y1)


def track_aspect_ratio(track: Track) -> float | None:
    """Median aspect ratio over all fully visible observations of the track."""
    if track.aspect_samples:
        return statistics.median(track.aspect_samples)
    if track.best_bbox is not None:
        return bbox_aspect_ratio(track.best_bbox)
    if track.fallback_bbox is not None:
        return bbox_aspect_ratio(track.fallback_bbox)
    return None


def classify_track(track: Track) -> str:
    """Classify by shape: cargo ships are very elongated, sailboats are taller
    than they are long (mast). Everything in between stays "other"."""
    aspect_ratio = track_aspect_ratio(track)
    if aspect_ratio is None:
        return "unknown"

    if aspect_ratio >= CARGO_MIN_ASPECT_RATIO:
        return "cargo"

    if aspect_ratio <= SAILBOAT_MAX_ASPECT_RATIO:
        return "sailboat"

    return "other"


def expire_tracks(now: float) -> list[Track]:
    """Drop stale tracks; return unregistered ones so callers can still register
    ships that left the frame before meeting the normal criteria."""
    expired_ids = [
        track_id
        for track_id, track in tracks.items()
        if now - track.last_seen > (REGISTERED_TRACK_TTL_SECONDS if track.registered else TRACK_TTL_SECONDS)
    ]

    expired_unregistered: list[Track] = []
    for track_id in expired_ids:
        track = tracks.pop(track_id)
        if not track.registered:
            expired_unregistered.append(track)

    return expired_unregistered


def update_tracks(camera_id: str, detections: list[Detection], frame: np.ndarray) -> list[Track]:
    now = time.time()
    height, width = frame.shape[:2]
    changed: list[Track] = []

    for detection, matched_track in assign_detections_to_tracks(camera_id, detections, now):
        cx, cy = centroid(detection.bbox)
        best_track = matched_track

        if best_track is None:
            best_track = Track(id=str(uuid.uuid4()), camera_id=camera_id, first_seen=now, last_seen=now)
            tracks[best_track.id] = best_track

        best_track.points.append((cx, cy))
        best_track.point_times.append(now)
        best_track.last_seen = now
        best_track.last_bbox = detection.bbox
        x1, _, x2, _ = detection.bbox
        best_track.width_history.append(float(max(1, x2 - x1)))

        frame_center_score = center_score(cx, cy, width, height)
        best_track.best_confidence = max(best_track.best_confidence, detection.confidence)
        frame_quality = frame_quality_score(frame_center_score, detection.confidence)
        fully_visible = is_fully_visible(detection.bbox, width, height)

        # A photo only counts as "ship fully in view" when the bbox is clear of
        # the frame edges AND its size has stopped growing: a ship that is
        # still entering the frame shows a smaller, growing box around just the
        # visible part, which would otherwise pass the edge check.
        if fully_visible and size_is_stable(best_track):
            best_track.aspect_samples.append(bbox_aspect_ratio(detection.bbox))

            if frame_quality > best_track.best_frame_quality:
                best_track.best_frame_quality = frame_quality
                best_track.best_center_score = frame_center_score
                best_track.best_bbox = detection.bbox
                best_track.best_frame = frame.copy()
        elif frame_quality > best_track.fallback_frame_quality:
            best_track.fallback_frame_quality = frame_quality
            best_track.fallback_bbox = detection.bbox
            best_track.fallback_frame = frame.copy()

        changed.append(best_track)

    return changed


def displacement_for(track: Track) -> float:
    if len(track.points) < 2:
        return 0
    start_x, start_y = track.points[0]
    end_x, end_y = track.points[-1]
    return float(np.hypot(end_x - start_x, end_y - start_y))


def direction_for(track: Track) -> str:
    if len(track.points) < 2:
        return "unknown"
    start_x = track.points[0][0]
    end_x = track.points[-1][0]
    delta = end_x - start_x
    if abs(delta) < 20:
        return "unknown"
    return "left_to_right" if delta > 0 else "right_to_left"


def debug_tracks_for(camera_id: str) -> list[dict[str, Any]]:
    return [
        {
            "id": track.id,
            "points": len(track.points),
            "registered": track.registered,
            "direction": direction_for(track),
            "displacement": round(displacement_for(track), 1),
            "centerScore": round(track.best_center_score, 3),
            "fullyVisible": track.best_frame is not None,
            "sizeStable": size_is_stable(track),
            "width": round(track.width_history[-1], 1) if track.width_history else 0,
            "aspectRatio": round(track_aspect_ratio(track) or 0, 2),
        }
        for track in tracks.values()
        if track.camera_id == camera_id
    ]


def track_ready_for_registration(track: Track) -> bool:
    """A track registers as soon as the ship has been fully in view, has moved,
    and has enough observations. Direction is recorded but never required, so
    slow ships and unusual headings are still captured."""
    if track.registered or len(track.points) < MIN_TRACK_FRAMES:
        return False

    if displacement_for(track) < MIN_TRACK_DISPLACEMENT:
        return False

    if track.best_frame is None:
        return False

    return True


def track_qualifies_for_fallback(track: Track) -> bool:
    """Tracks that left the frame unregistered (fast ships, or ships that were
    never fully in view) still register if they show real movement."""
    if track.registered or len(track.points) < FALLBACK_MIN_TRACK_FRAMES:
        return False

    if displacement_for(track) < MIN_TRACK_DISPLACEMENT:
        return False

    return track.best_frame is not None or track.fallback_frame is not None


def pick_registration_candidates(camera_id: str) -> list[Track]:
    candidates = [
        track
        for track in tracks.values()
        if track.camera_id == camera_id and track_ready_for_registration(track)
    ]

    return sorted(
        candidates,
        key=lambda track: (track.best_frame_quality, track.best_center_score, track.best_confidence),
        reverse=True,
    )


def registration_frame_for(track: Track) -> tuple[np.ndarray | None, tuple[int, int, int, int] | None]:
    if track.best_frame is not None:
        return track.best_frame, track.best_bbox
    return track.fallback_frame, track.fallback_bbox


def register_track(track: Track) -> dict[str, Any]:
    passage_id = str(uuid.uuid4())
    detected_type = classify_track(track)
    frame, bbox = registration_frame_for(track)
    annotated = annotated_photo(frame, bbox, detected_type)
    photo_path = save_photo(annotated, passage_id)
    photo_data = encode_photo(annotated)
    insert_passage(passage_id, track, photo_path, detected_type, bbox)
    track.registered = True
    remember_passage(track)

    return {
        "id": passage_id,
        "direction": direction_for(track),
        "confidence": round(track.best_confidence, 4),
        "detectedType": detected_type,
        "photoPath": photo_path,
        "photoData": photo_data,
        "bbox": list(bbox) if bbox else None,
        "fullyVisible": track.best_frame is not None,
        "aspectRatio": round(track_aspect_ratio(track) or 0, 3),
        "centerScore": round(track.best_center_score, 4),
    }


def draw_ship_bbox(frame: np.ndarray, bbox: tuple[int, int, int, int], ship_type: str | None = None) -> None:
    x1, y1, x2, y2 = bbox
    thickness = max(4, int(min(frame.shape[0], frame.shape[1]) * 0.006))
    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 0), thickness + 4)
    cv2.rectangle(frame, (x1, y1), (x2, y2), (238, 211, 34), thickness)

    if not ship_type or ship_type == "unknown":
        return

    label = SHIP_TYPE_LABELS.get(ship_type, ship_type)
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = max(0.6, thickness / 10)
    text_thickness = max(1, thickness // 3)
    (text_width, text_height), baseline = cv2.getTextSize(label, font, font_scale, text_thickness)
    label_top = max(0, y1 - text_height - baseline - 8)
    cv2.rectangle(frame, (x1, label_top), (x1 + text_width + 12, label_top + text_height + baseline + 8), (8, 47, 73), -1)
    cv2.putText(
        frame,
        label,
        (x1 + 6, label_top + text_height + 2),
        font,
        font_scale,
        (236, 254, 255),
        text_thickness,
        cv2.LINE_AA,
    )


def annotated_photo(
    frame: np.ndarray | None,
    bbox: tuple[int, int, int, int] | None,
    detected_type: str,
) -> np.ndarray | None:
    if frame is None:
        return None

    annotated = frame.copy()
    if bbox:
        draw_ship_bbox(annotated, bbox, detected_type)
    return annotated


def save_photo(annotated: np.ndarray | None, passage_id: str) -> str | None:
    if annotated is None:
        return None

    photo_path = PHOTO_DIR / f"{passage_id}.jpg"
    cv2.imwrite(str(photo_path), annotated)
    return str(photo_path)


def encode_photo(annotated: np.ndarray | None) -> str | None:
    if annotated is None:
        return None

    ok, buffer = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, PHOTO_JPEG_QUALITY])
    if not ok:
        return None
    return base64.b64encode(buffer.tobytes()).decode("ascii")


def insert_passage(
    passage_id: str,
    track: Track,
    photo_path: str | None,
    detected_type: str,
    photo_bbox: tuple[int, int, int, int] | None,
) -> None:
    if not DATABASE_URL:
        return

    bbox = list(photo_bbox or (0, 0, 0, 0))
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into public_passages (
                  id, occurred_at, direction, detection_confidence,
                  detected_type, identification_status, photo_url, created_at
                )
                values (%s, now(), %s, %s, %s, 'unknown', %s, now())
                on conflict (id) do nothing
                """,
                (passage_id, direction_for(track), track.best_confidence, detected_type, photo_path),
            )
            cur.execute(
                """
                insert into passage_photos (
                  id, passage_id, file_path, captured_at,
                  detection_confidence, bbox, created_at
                )
                values (%s, %s, %s, now(), %s, %s::jsonb, now())
                """,
                (str(uuid.uuid4()), passage_id, photo_path, track.best_confidence, str(bbox)),
            )


@app.get("/health")
def health():
    model_exists = Path(MODEL_PATH).exists() if DETECTION_MODE == "yolo" else None

    return {
        "ok": True,
        "mode": DETECTION_MODE,
        "model": MODEL_PATH if DETECTION_MODE == "yolo" else None,
        "modelExists": model_exists,
        "database": bool(DATABASE_URL),
        "registersPassages": DETECTION_MODE != "motion" or REGISTER_MOTION_PASSAGES,
        "shipClasses": sorted(SHIP_CLASS_NAMES),
        "minTrackFrames": MIN_TRACK_FRAMES,
        "fallbackMinTrackFrames": FALLBACK_MIN_TRACK_FRAMES,
        "minTrackDisplacement": MIN_TRACK_DISPLACEMENT,
        "trackTtlSeconds": TRACK_TTL_SECONDS,
        "registeredTrackTtlSeconds": REGISTERED_TRACK_TTL_SECONDS,
        "edgeMarginRatio": EDGE_MARGIN_RATIO,
        "sizeStableWindow": SIZE_STABLE_WINDOW,
        "sizeStableTolerance": SIZE_STABLE_TOLERANCE,
        "motionExtension": MOTION_EXTENSION_ENABLED,
        "shipMergeMaxGapRatio": SHIP_MERGE_MAX_GAP_RATIO,
        "centerZoneX": [CENTER_X_MIN, CENTER_X_MAX],
        "centerZoneY": [CENTER_Y_MIN, CENTER_Y_MAX],
        "passageCooldownSeconds": PASSAGE_COOLDOWN_SECONDS,
        "passageDuplicateDistance": PASSAGE_DUPLICATE_DISTANCE,
        "shipTypeClassification": "aspect_ratio",
        "cargoMinAspectRatio": CARGO_MIN_ASPECT_RATIO,
        "sailboatMaxAspectRatio": SAILBOAT_MAX_ASPECT_RATIO,
        "shipTypes": list(SHIP_TYPES),
    }


@app.post("/detect-frame")
async def detect_frame(frame: UploadFile = File(...), cameraId: str = Form("local-browser")):
    contents = await frame.read()
    image = decode_frame(contents)
    expired_tracks = expire_tracks(time.time())
    detections = detect_motion(cameraId, image) if DETECTION_MODE == "motion" else detect_ships(cameraId, image)
    update_tracks(cameraId, detections, image)
    passages: list[dict[str, Any]] = []
    registration_enabled = DETECTION_MODE == "yolo" or REGISTER_MOTION_PASSAGES

    if not registration_enabled:
        for track in tracks.values():
            if track.camera_id == cameraId and not track.registered and len(track.points) >= MIN_TRACK_FRAMES:
                track.registered = True
    else:
        # Safety net: ships that left the frame before they were fully visible
        # (or moved too fast for the normal criteria) are still registered once.
        for track in expired_tracks:
            if track_qualifies_for_fallback(track) and not is_duplicate_passage(track):
                passages.append(register_track(track))

        for candidate in pick_registration_candidates(cameraId):
            if is_duplicate_passage(candidate):
                candidate.registered = True
            else:
                passages.append(register_track(candidate))

    return {
        "cameraId": cameraId,
        "detections": [
            {"label": item.label, "confidence": round(item.confidence, 4), "bbox": list(item.bbox)}
            for item in detections
        ],
        "passages": passages,
        "passage": passages[0] if passages else None,
        "registrationEnabled": registration_enabled,
        "registrationMode": "debug_motion_only" if not registration_enabled else DETECTION_MODE,
        "tracks": debug_tracks_for(cameraId),
    }
