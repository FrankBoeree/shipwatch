import type { ShipType } from "./types";

export type Bbox = [number, number, number, number];

const CARGO_MIN_WIDTH_RATIO = 0.22;
const CARGO_MIN_AREA_RATIO = 0.055;
const SMALL_MAX_WIDTH_RATIO = 0.12;
const SAIL_MAX_ASPECT_RATIO = 0.95;

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

  const widthRatio = boxWidth / frameWidth;
  const areaRatio = (boxWidth * boxHeight) / (frameWidth * frameHeight);
  const aspectRatio = boxWidth / boxHeight;

  if (widthRatio >= CARGO_MIN_WIDTH_RATIO || areaRatio >= CARGO_MIN_AREA_RATIO) {
    return "cargo";
  }

  if (widthRatio < SMALL_MAX_WIDTH_RATIO || aspectRatio <= SAIL_MAX_ASPECT_RATIO) {
    return "pleasure_craft";
  }

  return "other";
}
