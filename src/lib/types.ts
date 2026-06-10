export type ShipType =
  | "pleasure_craft"
  | "cargo"
  | "container"
  | "tanker"
  | "passenger"
  | "tour_boat"
  | "tug"
  | "ferry"
  | "other"
  | "unknown";

export type Direction = "left_to_right" | "right_to_left" | "unknown";
export type IdentificationStatus = "identified" | "unknown" | "ambiguous";

export type Ship = {
  id: string;
  mmsi: string | null;
  imo: string | null;
  name: string | null;
  shipType: ShipType;
  lengthM: number | null;
  widthM: number | null;
  firstSeenAt: string;
  lastSeenAt: string;
  passageCount: number;
};

export type Passage = {
  id: string;
  shipId: string | null;
  occurredAt: string;
  direction: Direction;
  detectionConfidence: number;
  detectedType: ShipType;
  identificationStatus: IdentificationStatus;
  photoUrl: string | null;
  shipName: string | null;
  mmsi: string | null;
};

export type TimeGranularity = "day" | "week" | "month";

export type PassageTimeBucket = {
  period: string;
  total: number;
  leftToRight: number;
  rightToLeft: number;
};

export type StatsSummary = {
  passagesPerDay: Array<{ date: string; passageCount: number }>;
  passagesPerHour: Array<{ hour: string; passageCount: number }>;
  passagesPerShipType: Array<{ shipType: ShipType; passageCount: number }>;
  mostFrequentShips: Array<{ shipId: string; name: string; passageCount: number }>;
  newVsReturning: { newShips: number; returningShips: number };
};

export const shipTypeLabels: Record<ShipType, string> = {
  pleasure_craft: "Pleziervaart",
  cargo: "Vrachtschip",
  container: "Containerschip",
  tanker: "Tanker",
  passenger: "Passagiersschip",
  tour_boat: "Rondvaartboot",
  tug: "Sleepboot",
  ferry: "Veerboot",
  other: "Overig",
  unknown: "Onbekend",
};

export const directionLabels: Record<Direction, string> = {
  left_to_right: "Links naar rechts",
  right_to_left: "Rechts naar links",
  unknown: "Onbekend",
};
