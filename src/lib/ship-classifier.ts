import type { ShipType } from "./types";

export type Bbox = [number, number, number, number];

// Cargo ships are far longer than they are high; sailboats (mast) are higher
// than they are long. Everything in between stays "other".
const CARGO_MIN_ASPECT_RATIO = 3.0;
const SAILBOAT_MAX_ASPECT_RATIO = 0.9;

export function classifyShipTypeFromBbox(
  bbox: Bbox,
  frameWidth: number,
  frameHeight: number,
): ShipType {
  if (frameWidth <= 0 || frameHeight <= 0) {
    return "unknown";
  }

  const [x1, y1, x2, y2] = bbox;
  const boxWidth = Math.max(1, x2 - x1);
  const boxHeight = Math.max(1, y2 - y1);
  const aspectRatio = boxWidth / boxHeight;

  if (aspectRatio >= CARGO_MIN_ASPECT_RATIO) {
    return "cargo";
  }

  if (aspectRatio <= SAILBOAT_MAX_ASPECT_RATIO) {
    return "sailboat";
  }

  return "other";
}
