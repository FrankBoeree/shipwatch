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
TRACK_MAX_DISTANCE = float(os.getenv("TRACK_MAX_DISTANCE", "120"))
TRACK_TTL_SECONDS = float(os.getenv("TRACK_TTL_SECONDS", "4"))
REGISTERED_TRACK_TTL_SECONDS = float(os.getenv("REGISTERED_TRACK_TTL_SECONDS", "45"))
MIN_TRACK_DISPLACEMENT = float(os.getenv("MIN_TRACK_DISPLACEMENT", "60"))
DETECTION_MODE = os.getenv("DETECTION_MODE", "yolo")
SHIP_CLASS_NAMES = {"boat", "ship"}
MOTION_MIN_AREA = int(os.getenv("MOTION_MIN_AREA", "4500"))
REGISTER_MOTION_PASSAGES = os.getenv("REGISTER_MOTION_PASSAGES", "false").lower() == "true"

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
    best_frame: np.ndarray | None = None
    best_bbox: tuple[int, int, int, int] | None = None
    registered: bool = False


tracks: dict[str, Track] = {}
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


def update_tracks(camera_id: str, detections: list[Detection], frame: np.ndarray) -> list[Track]:
    now = time.time()
    expired = [
        track_id
        for track_id, track in tracks.items()
        if now - track.last_seen > (REGISTERED_TRACK_TTL_SECONDS if track.registered else TRACK_TTL_SECONDS)
    ]
    for track_id in expired:
        del tracks[track_id]

    changed: list[Track] = []

    for detection in detections:
        cx, cy = centroid(detection.bbox)
        best_track: Track | None = None
        best_distance = TRACK_MAX_DISTANCE

        for track in tracks.values():
            if track.camera_id != camera_id or not track.points:
                continue
            px, py = track.points[-1]
            distance = float(np.hypot(cx - px, cy - py))
            if distance < best_distance:
                best_distance = distance
                best_track = track

        if best_track is None:
            best_track = Track(id=str(uuid.uuid4()), camera_id=camera_id, first_seen=now, last_seen=now)
            tracks[best_track.id] = best_track

        best_track.points.append((cx, cy))
        best_track.last_seen = now

        if detection.confidence >= best_track.best_confidence:
            best_track.best_confidence = detection.confidence
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
    if abs(delta) < 30:
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
        }
        for track in tracks.values()
        if track.camera_id == camera_id
    ]


def draw_ship_bbox(frame: np.ndarray, bbox: tuple[int, int, int, int]) -> None:
    x1, y1, x2, y2 = bbox
    thickness = max(4, int(min(frame.shape[0], frame.shape[1]) * 0.006))
    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 0), thickness + 4)
    cv2.rectangle(frame, (x1, y1), (x2, y2), (238, 211, 34), thickness)


def save_photo(track: Track, passage_id: str) -> str | None:
    if track.best_frame is None:
        return None

    photo_path = PHOTO_DIR / f"{passage_id}.jpg"
    frame = track.best_frame.copy()

    if track.best_bbox:
        draw_ship_bbox(frame, track.best_bbox)

    cv2.imwrite(str(photo_path), frame)
    return str(photo_path)


def insert_passage(passage_id: str, track: Track, photo_path: str | None) -> None:
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
                values (%s, now(), %s, %s, 'unknown', 'unknown', %s, now())
                on conflict (id) do nothing
                """,
                (passage_id, direction_for(track), track.best_confidence, photo_path),
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
    }


@app.post("/detect-frame")
async def detect_frame(frame: UploadFile = File(...), cameraId: str = Form("local-browser")):
    contents = await frame.read()
    image = decode_frame(contents)
    detections = detect_motion(cameraId, image) if DETECTION_MODE == "motion" else detect_ships(image)
    changed_tracks = update_tracks(cameraId, detections, image)
    passage = None
    registration_enabled = DETECTION_MODE == "yolo" or REGISTER_MOTION_PASSAGES

    for track in changed_tracks:
        if track.registered or len(track.points) < MIN_TRACK_FRAMES:
            continue

        if not registration_enabled:
            track.registered = True
            continue

        if displacement_for(track) < MIN_TRACK_DISPLACEMENT or direction_for(track) == "unknown":
            continue

        passage_id = str(uuid.uuid4())
        photo_path = save_photo(track, passage_id)
        insert_passage(passage_id, track, photo_path)
        track.registered = True
        passage = {
            "id": passage_id,
            "direction": direction_for(track),
            "confidence": round(track.best_confidence, 4),
            "photoPath": photo_path,
            "bbox": list(track.best_bbox) if track.best_bbox else None,
        }
        break

    return {
        "cameraId": cameraId,
        "detections": [
            {"label": item.label, "confidence": round(item.confidence, 4), "bbox": list(item.bbox)}
            for item in detections
        ],
        "passage": passage,
        "registrationEnabled": registration_enabled,
        "registrationMode": "debug_motion_only" if not registration_enabled else DETECTION_MODE,
        "tracks": debug_tracks_for(cameraId),
    }
