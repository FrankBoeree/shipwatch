"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CircleStop, ShipWheel, Upload } from "lucide-react";
import { CameraFrame } from "@/components/camera-frame";
import { CAMERA_FRAME_HEIGHT, CAMERA_FRAME_WIDTH } from "@/lib/camera";

type Bbox = [number, number, number, number];

type DetectionResponse = {
  detections?: Array<{ label: string; confidence: number; bbox: Bbox }>;
  passage?: {
    id: string;
    direction: string;
    confidence: number;
    detectedType?: string;
    photoPath?: string | null;
    bbox?: Bbox | null;
  } | null;
  registrationEnabled?: boolean;
  registrationMode?: string;
  error?: string;
};

function pickPassageBbox(
  passage: NonNullable<DetectionResponse["passage"]>,
  detections: DetectionResponse["detections"],
): Bbox | null {
  if (passage.bbox) {
    return passage.bbox;
  }

  if (!detections?.length) {
    return null;
  }

  return detections.reduce((best, current) => (current.confidence > best.confidence ? current : best)).bbox;
}

function mapBboxToDisplay(
  bbox: Bbox,
  sourceWidth: number,
  sourceHeight: number,
  destWidth: number,
  destHeight: number,
): Bbox {
  const scale = Math.min(destWidth / sourceWidth, destHeight / sourceHeight);
  const scaledWidth = sourceWidth * scale;
  const scaledHeight = sourceHeight * scale;
  const offsetX = (destWidth - scaledWidth) / 2;
  const offsetY = (destHeight - scaledHeight) / 2;
  const [x1, y1, x2, y2] = bbox;

  return [x1 * scale + offsetX, y1 * scale + offsetY, x2 * scale + offsetX, y2 * scale + offsetY];
}

function drawShipBbox(ctx: CanvasRenderingContext2D, [x1, y1, x2, y2]: Bbox) {
  const width = x2 - x1;
  const height = y2 - y1;
  const lineWidth = Math.max(3, Math.round(Math.min(ctx.canvas.width, ctx.canvas.height) * 0.005));

  ctx.lineJoin = "round";
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = lineWidth + 3;
  ctx.strokeRect(x1, y1, width, height);
  ctx.strokeStyle = "#22d3ee";
  ctx.lineWidth = lineWidth;
  ctx.strokeRect(x1, y1, width, height);
}

function drawLiveDetections(
  canvas: HTMLCanvasElement,
  detections: DetectionResponse["detections"],
  sourceWidth: number,
  sourceHeight: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const { width, height } = canvas.getBoundingClientRect();
  if (!width || !height) {
    return;
  }

  const pixelRatio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  for (const detection of detections ?? []) {
    const bbox = mapBboxToDisplay(detection.bbox, sourceWidth, sourceHeight, width, height);
    drawShipBbox(ctx, bbox);
  }
}

async function annotatePhotoBlob(blob: Blob, bbox: Bbox): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return blob;
  }

  ctx.drawImage(bitmap, 0, 0);
  drawShipBbox(ctx, bbox);
  bitmap.close();

  return new Promise((resolve) => {
    canvas.toBlob((annotated) => resolve(annotated ?? blob), "image/jpeg", 0.82);
  });
}

type DetectorHealth = {
  ok: boolean;
  mode: string;
  database: boolean;
  registersPassages: boolean;
  model?: string | null;
  modelExists?: boolean | null;
  shipClasses?: string[];
};

async function readSyncError(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error;
  } catch {
    return null;
  }
}

const detectorOptions = [
  {
    id: "motion",
    label: "Beweging debug",
    url: process.env.NEXT_PUBLIC_DETECTOR_URL ?? "http://localhost:8000/detect-frame",
  },
  {
    id: "yolo",
    label: "Scheepsdetectie",
    url: process.env.NEXT_PUBLIC_YOLO_DETECTOR_URL ?? "http://localhost:8001/detect-frame",
  },
];

export function CaptureClient() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const syncedPassageIdsRef = useRef<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("Camera niet actief");
  const [liveDetections, setLiveDetections] = useState<DetectionResponse["detections"]>([]);
  const [lastResponse, setLastResponse] = useState<DetectionResponse | null>(null);
  const [lastSnapshotAt, setLastSnapshotAt] = useState<string | null>(null);
  const [detectorUrl, setDetectorUrl] = useState(detectorOptions[0].url);
  const [health, setHealth] = useState<DetectorHealth | null>(null);
  const [syncToken, setSyncToken] = useState("");
  const [syncApiUrl, setSyncApiUrl] = useState(process.env.NEXT_PUBLIC_SYNC_API_URL ?? "");

  const healthUrl = detectorUrl.replace(/\/detect-frame$/, "/health");

  const redrawLiveOverlay = useCallback(() => {
    const video = videoRef.current;
    const overlay = overlayRef.current;

    if (!video || !overlay || !video.videoWidth || !video.videoHeight) {
      return;
    }

    drawLiveDetections(overlay, liveDetections, video.videoWidth, video.videoHeight);
  }, [liveDetections]);

  const captureBlob = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      return null;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);

    return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  }, []);

  const syncUrl = useCallback((path: string) => {
    return new URL(path, syncApiUrl || window.location.origin).toString();
  }, [syncApiUrl]);

  const syncPassage = useCallback(async (
    passage: NonNullable<DetectionResponse["passage"]>,
    frameBlob: Blob | null,
  ) => {
    const response = await fetch(syncUrl("/api/sync/passage"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(syncToken ? { "x-sync-token": syncToken } : {}),
      },
      body: JSON.stringify({
        id: passage.id,
        occurredAt: new Date().toISOString(),
        direction: passage.direction,
        detectionConfidence: passage.confidence,
        detectedType: passage.detectedType ?? "unknown",
        identificationStatus: "unknown",
        photoUrl: null,
      }),
    });

    if (!response.ok) {
      const error = await readSyncError(response);
      setStatus(error ?? "Passage-sync gaf een fout terug");
      return;
    }

    if (frameBlob) {
      const photoForm = new FormData();
      photoForm.append("passageId", passage.id);
      photoForm.append("photo", frameBlob, `${passage.id}.jpg`);

      const photoResponse = await fetch(syncUrl("/api/sync/passage-photo"), {
        method: "POST",
        headers: syncToken ? { "x-sync-token": syncToken } : undefined,
        body: photoForm,
      });

      if (!photoResponse.ok) {
        const error = await readSyncError(photoResponse);
        setStatus(error ?? "Passage-foto upload gaf een fout terug");
        return;
      }
    }

    setStatus(
      passage.detectedType
        ? `Passage gesynchroniseerd: ${passage.id} (${passage.detectedType})`
        : `Passage gesynchroniseerd: ${passage.id}`,
    );
  }, [syncToken, syncUrl]);

  const sendFrame = useCallback(async (syncSnapshot: boolean) => {
    const blob = await captureBlob();

    if (!blob) {
      return;
    }

    const formData = new FormData();
    formData.append("frame", blob, "frame.jpg");
    formData.append("cameraId", "local-browser");

    try {
      const response = await fetch(detectorUrl, { method: "POST", body: formData });
      const payload = (await response.json()) as DetectionResponse;
      setLastResponse(payload);
      setLiveDetections(payload.detections ?? []);

      if (!response.ok) {
        setStatus(payload.error ?? "Detector gaf een fout terug");
      }

      if (payload.passage && !syncedPassageIdsRef.current.has(payload.passage.id)) {
        syncedPassageIdsRef.current.add(payload.passage.id);
        const bbox = pickPassageBbox(payload.passage, payload.detections);
        const photoBlob = bbox ? await annotatePhotoBlob(blob, bbox) : blob;
        await syncPassage(payload.passage, photoBlob);
      }

      if (syncSnapshot) {
        const snapshotForm = new FormData();
        snapshotForm.append("snapshot", blob, "latest.jpg");
        const snapshotResponse = await fetch(syncUrl("/api/sync/snapshot"), {
          method: "POST",
          headers: syncToken ? { "x-sync-token": syncToken } : undefined,
          body: snapshotForm,
        });

        if (!snapshotResponse.ok) {
          const error = await readSyncError(snapshotResponse);
          setStatus(error ?? "Snapshot-sync gaf een fout terug");
          return;
        }

        setLastSnapshotAt(new Date().toISOString());
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Detector niet bereikbaar");
    }
  }, [captureBlob, detectorUrl, syncPassage, syncToken, syncUrl]);

  useEffect(() => {
    setSyncToken(window.localStorage.getItem("shipwatch-sync-token") ?? "");
    setSyncApiUrl(
      window.localStorage.getItem("shipwatch-sync-api-url") ??
        process.env.NEXT_PUBLIC_SYNC_API_URL ??
        window.location.origin,
    );
  }, []);

  function updateSyncToken(value: string) {
    setSyncToken(value);
    window.localStorage.setItem("shipwatch-sync-token", value);
  }

  function updateSyncApiUrl(value: string) {
    setSyncApiUrl(value);
    window.localStorage.setItem("shipwatch-sync-api-url", value);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadHealth() {
      try {
        const response = await fetch(healthUrl);
        const payload = (await response.json()) as DetectorHealth;
        if (!cancelled) {
          setHealth(payload);
        }
      } catch {
        if (!cancelled) {
          setHealth(null);
        }
      }
    }

    void loadHealth();
    const timer = window.setInterval(loadHealth, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [healthUrl]);

  useEffect(() => {
    redrawLiveOverlay();
  }, [liveDetections, redrawLiveOverlay]);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) {
      return;
    }

    const observer = new ResizeObserver(() => {
      redrawLiveOverlay();
    });

    observer.observe(preview);
    return () => observer.disconnect();
  }, [redrawLiveOverlay]);

  useEffect(() => {
    if (!running) {
      setLiveDetections([]);
      syncedPassageIdsRef.current.clear();
    }
  }, [running]);

  useEffect(() => {
    if (!running) {
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let frameTimer: number | null = null;
    let snapshotTimer: number | null = null;

    async function start() {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: CAMERA_FRAME_WIDTH },
          height: { ideal: CAMERA_FRAME_HEIGHT },
        },
        audio: false,
      });

      if (!videoRef.current || cancelled) {
        return;
      }

      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setStatus("Camera actief, frames worden verstuurd");

      frameTimer = window.setInterval(() => {
        void sendFrame(false);
      }, 750);

      snapshotTimer = window.setInterval(() => {
        void sendFrame(true);
      }, 10_000);
    }

    start().catch((error: Error) => {
      setStatus(error.message);
      setRunning(false);
    });

    return () => {
      cancelled = true;
      if (frameTimer) window.clearInterval(frameTimer);
      if (snapshotTimer) window.clearInterval(snapshotTimer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [running, sendFrame]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <CameraFrame
        ref={previewRef}
        className="rounded-lg border border-slate-200"
      >
        <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full bg-slate-950 object-contain" />
        <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />
        <canvas ref={canvasRef} className="hidden" />
      </CameraFrame>
      <aside className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-5">
          <p className="mb-2 text-sm font-medium text-slate-500">Detector</p>
          <div className="grid gap-2">
            {detectorOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setDetectorUrl(option.url)}
                className={`inline-flex h-10 items-center justify-between rounded-md border px-3 text-sm font-semibold ${
                  detectorUrl === option.url
                    ? "border-cyan-800 bg-cyan-50 text-cyan-950"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <ShipWheel size={16} />
                  {option.label}
                </span>
                <span>{option.id === "yolo" ? ":8001" : ":8000"}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setRunning(true)}
            disabled={running}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-cyan-900 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Camera size={16} />
            Start
          </button>
          <button
            type="button"
            onClick={() => setRunning(false)}
            disabled={!running}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:text-slate-300"
          >
            <CircleStop size={16} />
            Stop
          </button>
        </div>
        <dl className="mt-6 space-y-4 text-sm">
          <div>
            <dt className="font-medium text-slate-500">Sync endpoint</dt>
            <dd className="mt-1">
              <input
                type="url"
                value={syncApiUrl}
                onChange={(event) => updateSyncApiUrl(event.target.value)}
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950"
                placeholder="https://shipwatch.netlify.app"
              />
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Sync token</dt>
            <dd className="mt-1">
              <input
                type="password"
                value={syncToken}
                onChange={(event) => updateSyncToken(event.target.value)}
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950"
                placeholder="Lokale sync token"
              />
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Status</dt>
            <dd className="mt-1 text-slate-950">{status}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Detector</dt>
            <dd className="mt-1 break-all text-slate-950">{detectorUrl}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Registratie</dt>
            <dd className={`mt-1 font-semibold ${health?.registersPassages ? "text-emerald-700" : "text-slate-500"}`}>
              {health ? (health.registersPassages ? "Aan voor scheepsdetectie" : "Uit voor debug-mode") : "Niet bereikbaar"}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Mode</dt>
            <dd className="mt-1 text-slate-950">
              {health ? `${health.mode}${health.modelExists === false ? " (model ontbreekt)" : ""}` : "-"}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Laatste snapshot-sync</dt>
            <dd className="mt-1 text-slate-950">{lastSnapshotAt ? new Date(lastSnapshotAt).toLocaleTimeString("nl-NL") : "-"}</dd>
          </div>
        </dl>
        <div className="mt-6 rounded-md bg-slate-50 p-4 text-sm text-slate-700">
          <div className="mb-2 flex items-center gap-2 font-semibold text-slate-900">
            <Upload size={16} />
            Laatste detectie
          </div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">
            {lastResponse ? JSON.stringify(lastResponse, null, 2) : "Nog geen detectie-response."}
          </pre>
        </div>
      </aside>
    </div>
  );
}
