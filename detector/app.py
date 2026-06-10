from __future__ import annotations

import os
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
MIN_TRACK_FRAMES = int(os.getenv("MIN_TRACK_FRAMES", "4"))
TRACK_MAX_DISTANCE = float(os.getenv("TRACK_MAX_DISTANCE", "150"))
TRACK_TTL_SECONDS = float(os.getenv("TRACK_TTL_SECONDS", "4"))
REGISTERED_TRACK_TTL_SECONDS = float(os.getenv("REGISTERED_TRACK_TTL_SECONDS", "45"))
MIN_TRACK_DISPLACEMENT = float(os.getenv("MIN_TRACK_DISPLACEMENT", "45"))
MIN_CENTER_SCORE = float(os.getenv("MIN_CENTER_SCORE", "0.2"))
CENTER_ZONE_X = os.getenv("CENTER_ZONE_X", "0.1,0.9")
CENTER_ZONE_Y = os.getenv("CENTER_ZONE_Y", "0.35,0.95")
PASSAGE_COOLDOWN_SECONDS = float(os.getenv("PASSAGE_COOLDOWN_SECONDS", "60"))
PASSAGE_COOLDOWN_X_DISTANCE = float(os.getenv("PASSAGE_COOLDOWN_X_DISTANCE", "80"))
PASSAGE_COOLDOWN_Y_DISTANCE = float(os.getenv("PASSAGE_COOLDOWN_Y_DISTANCE", "70"))
TRACK_MATCH_MIN_SCORE = float(os.getenv("TRACK_MATCH_MIN_SCORE", "0.15"))
DETECTION_MODE = os.getenv("DETECTION_MODE", "yolo")
SHIP_CLASS_NAMES = {"boat", "ship"}
MOTION_MIN_AREA = int(os.getenv("MOTION_MIN_AREA", "4500"))
REGISTER_MOTION_PASSAGES = os.getenv("REGISTER_MOTION_PASSAGES", "false").lower() == "true"
CARGO_MIN_WIDTH_RATIO = float(os.getenv("CARGO_MIN_WIDTH_RATIO", "0.22"))
CARGO_MIN_AREA_RATIO = float(os.getenv("CARGO_MIN_AREA_RATIO", "0.055"))
SMALL_MAX_WIDTH_RATIO = float(os.getenv("SMALL_MAX_WIDTH_RATIO", "0.12"))
SAIL_MAX_ASPECT_RATIO = float(os.getenv("SAIL_MAX_ASPECT_RATIO", "0.95"))
SHIP_TYPES = ("pleasure_craft", "cargo", "other", "unknown")
SHIP_TYPE_LABELS = {
    "pleasure_craft": "Pleziervaart",
    "cargo": "Vrachtschip",
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
    best_confidence: float = 0
    best_center_score: float = 0
    best_frame_quality: float = 0
    best_frame: np.ndarray | None = None
    best_bbox: tuple[int, int, int, int] | None = None
    last_bbox: tuple[int, int, int, int] | None = None
    registered: bool = False


@dataclass
class RecentPassage:
    registered_at: float
    direction: str
    start_x: float
    exit_x: float
    start_y: float
    exit_y: float


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


def detect_ships(frame: np.ndarray) -> list[Detection]:
    if DETECTION_MODE == "motion":
        return detect_motion("local-browser", frame)

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

    return detections


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


def predicted_centroid(track: Track) -> tuple[float, float]:
    if len(track.points) >= 2:
        px, py = track.points[-2]
        cx, cy = track.points[-1]
        return (cx + (cx - px), cy + (cy - py))
    return track.points[-1]


def track_match_score(track: Track, detection: Detection, width: int, height: int) -> float:
    if not track.points:
        return 0.0

    cx, cy = centroid(detection.bbox)
    px, py = predicted_centroid(track)
    distance = float(np.hypot(cx - px, cy - py))
    distance_score = max(0.0, 1.0 - distance / TRACK_MAX_DISTANCE)

    iou_score = bbox_iou(track.last_bbox, detection.bbox) if track.last_bbox else 0.0
    combined = (distance_score * 0.45) + (iou_score * 0.55)

    if track.registered:
        combined += 0.2

    return combined


def prune_recent_passages(now: float) -> None:
    global recent_passages
    recent_passages = [
        item for item in recent_passages if now - item.registered_at <= PASSAGE_COOLDOWN_SECONDS
    ]


def is_duplicate_passage(track: Track) -> bool:
    now = time.time()
    prune_recent_passages(now)
    direction = direction_for(track)
    start_x, start_y = track.points[0]
    exit_x, exit_y = track.points[-1]

    for item in recent_passages:
        if item.direction != direction:
            continue
        start_close = (
            abs(start_x - item.start_x) <= PASSAGE_COOLDOWN_X_DISTANCE
            and abs(start_y - item.start_y) <= PASSAGE_COOLDOWN_Y_DISTANCE
        )
        exit_close = (
            abs(exit_x - item.exit_x) <= PASSAGE_COOLDOWN_X_DISTANCE
            and abs(exit_y - item.exit_y) <= PASSAGE_COOLDOWN_Y_DISTANCE
        )
        if start_close and exit_close:
            return True

    return False


def remember_passage(track: Track) -> None:
    recent_passages.append(
        RecentPassage(
            registered_at=time.time(),
            direction=direction_for(track),
            start_x=track.points[0][0],
            exit_x=track.points[-1][0],
            start_y=track.points[0][1],
            exit_y=track.points[-1][1],
        )
    )


def assign_detections_to_tracks(
    camera_id: str,
    detections: list[Detection],
    width: int,
    height: int,
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
            score = track_match_score(track, detection, width, height)
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


def classify_ship_type(frame: np.ndarray, bbox: tuple[int, int, int, int]) -> str:
    """Classify a detected vessel using simple bbox heuristics relative to the frame."""
    frame_height, frame_width = frame.shape[:2]
    if frame_width <= 0 or frame_height <= 0:
        return "unknown"

    x1, y1, x2, y2 = bbox
    box_width = max(1, x2 - x1)
    box_height = max(1, y2 - y1)

    width_ratio = box_width / frame_width
    area_ratio = (box_width * box_height) / (frame_width * frame_height)
    aspect_ratio = box_width / box_height

    if width_ratio >= CARGO_MIN_WIDTH_RATIO or area_ratio >= CARGO_MIN_AREA_RATIO:
        return "cargo"

    if width_ratio < SMALL_MAX_WIDTH_RATIO or aspect_ratio <= SAIL_MAX_ASPECT_RATIO:
        return "pleasure_craft"

    return "other"


def update_tracks(camera_id: str, detections: list[Detection], frame: np.ndarray) -> list[Track]:
    now = time.time()
    expired = [
        track_id
        for track_id, track in tracks.items()
        if now - track.last_seen > (REGISTERED_TRACK_TTL_SECONDS if track.registered else TRACK_TTL_SECONDS)
    ]
    for track_id in expired:
        del tracks[track_id]

    height, width = frame.shape[:2]
    changed: list[Track] = []

    for detection, matched_track in assign_detections_to_tracks(camera_id, detections, width, height):
        cx, cy = centroid(detection.bbox)
        best_track = matched_track

        if best_track is None:
            best_track = Track(id=str(uuid.uuid4()), camera_id=camera_id, first_seen=now, last_seen=now)
            tracks[best_track.id] = best_track

        best_track.points.append((cx, cy))
        best_track.last_seen = now
        best_track.last_bbox = detection.bbox

        frame_center_score = center_score(cx, cy, width, height)
        best_track.best_confidence = max(best_track.best_confidence, detection.confidence)
        frame_quality = frame_quality_score(frame_center_score, detection.confidence)

        if frame_quality > best_track.best_frame_quality:
            best_track.best_frame_quality = frame_quality
            best_track.best_center_score = frame_center_score
            best_track.best_bbox = detection.bbox
            best_track.best_frame = frame.copy()

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
        }
        for track in tracks.values()
        if track.camera_id == camera_id
    ]


def track_ready_for_registration(track: Track) -> bool:
    if track.registered or len(track.points) < MIN_TRACK_FRAMES:
        return False

    if displacement_for(track) < MIN_TRACK_DISPLACEMENT:
        return False

    if direction_for(track) == "unknown":
        return False

    if track.best_frame is None:
        return False

    return True


def pick_registration_candidates(camera_id: str) -> list[Track]:
    candidates = [
        track
        for track in tracks.values()
        if track.camera_id == camera_id and track_ready_for_registration(track)
    ]

    if not candidates:
        return []

    centered = [track for track in candidates if track.best_center_score >= MIN_CENTER_SCORE]
    pool = centered if centered else candidates
    return sorted(
        pool,
        key=lambda track: (track.best_frame_quality, track.best_center_score, track.best_confidence),
        reverse=True,
    )


def register_track(track: Track) -> dict[str, Any]:
    passage_id = str(uuid.uuid4())
    detected_type = detected_type_for(track)
    photo_path = save_photo(track, passage_id, detected_type)
    insert_passage(passage_id, track, photo_path, detected_type)
    track.registered = True
    remember_passage(track)

    return {
        "id": passage_id,
        "direction": direction_for(track),
        "confidence": round(track.best_confidence, 4),
        "detectedType": detected_type,
        "photoPath": photo_path,
        "bbox": list(track.best_bbox) if track.best_bbox else None,
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


def save_photo(track: Track, passage_id: str, detected_type: str) -> str | None:
    if track.best_frame is None:
        return None

    photo_path = PHOTO_DIR / f"{passage_id}.jpg"
    frame = track.best_frame.copy()

    if track.best_bbox:
        draw_ship_bbox(frame, track.best_bbox, detected_type)

    cv2.imwrite(str(photo_path), frame)
    return str(photo_path)


def detected_type_for(track: Track) -> str:
    if track.best_frame is None or track.best_bbox is None:
        return "unknown"
    return classify_ship_type(track.best_frame, track.best_bbox)


def insert_passage(passage_id: str, track: Track, photo_path: str | None, detected_type: str) -> None:
    if not DATABASE_URL:
        return

    bbox = list(track.best_bbox or (0, 0, 0, 0))
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
        "minTrackDisplacement": MIN_TRACK_DISPLACEMENT,
        "trackTtlSeconds": TRACK_TTL_SECONDS,
        "registeredTrackTtlSeconds": REGISTERED_TRACK_TTL_SECONDS,
        "minCenterScore": MIN_CENTER_SCORE,
        "centerZoneX": [CENTER_X_MIN, CENTER_X_MAX],
        "centerZoneY": [CENTER_Y_MIN, CENTER_Y_MAX],
        "passageCooldownSeconds": PASSAGE_COOLDOWN_SECONDS,
        "passageCooldownYDistance": PASSAGE_COOLDOWN_Y_DISTANCE,
        "shipTypeClassification": "heuristic",
        "shipTypes": list(SHIP_TYPES),
    }


@app.post("/detect-frame")
async def detect_frame(frame: UploadFile = File(...), cameraId: str = Form("local-browser")):
    contents = await frame.read()
    image = decode_frame(contents)
    detections = detect_motion(cameraId, image) if DETECTION_MODE == "motion" else detect_ships(image)
    update_tracks(cameraId, detections, image)
    passages: list[dict[str, Any]] = []
    registration_enabled = DETECTION_MODE == "yolo" or REGISTER_MOTION_PASSAGES

    if not registration_enabled:
        for track in tracks.values():
            if track.camera_id == cameraId and not track.registered and len(track.points) >= MIN_TRACK_FRAMES:
                track.registered = True
    else:
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
