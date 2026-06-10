import { aggregatePassagesByPeriod } from "./passage-stats";
import type { Passage, PassageTimeBucket, Ship, StatsSummary, TimeGranularity } from "./types";

export const mockShips: Ship[] = [
  {
    id: "ship-amstel-1",
    mmsi: "244000001",
    imo: null,
    name: "IJveer 62",
    shipType: "ferry",
    lengthM: 33,
    widthM: 9,
    firstSeenAt: "2026-06-08T08:15:00.000Z",
    lastSeenAt: "2026-06-09T11:25:00.000Z",
    passageCount: 18,
  },
  {
    id: "ship-cargo-1",
    mmsi: "244000002",
    imo: "9876543",
    name: "Noordzee Trader",
    shipType: "cargo",
    lengthM: 86,
    widthM: 11.4,
    firstSeenAt: "2026-06-08T13:40:00.000Z",
    lastSeenAt: "2026-06-09T09:12:00.000Z",
    passageCount: 3,
  },
];

export const mockPassages: Passage[] = [
  {
    id: "passage-001",
    shipId: "ship-amstel-1",
    occurredAt: "2026-06-09T11:25:00.000Z",
    direction: "left_to_right",
    detectionConfidence: 0.91,
    detectedType: "ferry",
    identificationStatus: "identified",
    photoUrl: null,
    shipName: "IJveer 62",
    mmsi: "244000001",
  },
  {
    id: "passage-002",
    shipId: null,
    occurredAt: "2026-06-09T10:42:00.000Z",
    direction: "right_to_left",
    detectionConfidence: 0.76,
    detectedType: "pleasure_craft",
    identificationStatus: "unknown",
    photoUrl: null,
    shipName: null,
    mmsi: null,
  },
  {
    id: "passage-003",
    shipId: "ship-cargo-1",
    occurredAt: "2026-06-09T09:12:00.000Z",
    direction: "left_to_right",
    detectionConfidence: 0.88,
    detectedType: "cargo",
    identificationStatus: "identified",
    photoUrl: null,
    shipName: "Noordzee Trader",
    mmsi: "244000002",
  },
];

const mockPassageEvents = [
  { occurred_at: "2026-05-12T08:15:00.000Z", direction: "left_to_right" },
  { occurred_at: "2026-05-12T10:30:00.000Z", direction: "right_to_left" },
  { occurred_at: "2026-05-19T09:00:00.000Z", direction: "left_to_right" },
  { occurred_at: "2026-05-19T11:45:00.000Z", direction: "left_to_right" },
  { occurred_at: "2026-05-19T14:20:00.000Z", direction: "right_to_left" },
  { occurred_at: "2026-05-26T07:50:00.000Z", direction: "right_to_left" },
  { occurred_at: "2026-05-26T16:10:00.000Z", direction: "left_to_right" },
  { occurred_at: "2026-06-02T08:00:00.000Z", direction: "left_to_right" },
  { occurred_at: "2026-06-02T12:30:00.000Z", direction: "right_to_left" },
  { occurred_at: "2026-06-02T15:00:00.000Z", direction: "left_to_right" },
  { occurred_at: "2026-06-07T09:15:00.000Z", direction: "left_to_right" },
  { occurred_at: "2026-06-07T13:40:00.000Z", direction: "right_to_left" },
  { occurred_at: "2026-06-08T08:15:00.000Z", direction: "left_to_right" },
  { occurred_at: "2026-06-08T10:42:00.000Z", direction: "right_to_left" },
  { occurred_at: "2026-06-08T13:40:00.000Z", direction: "left_to_right" },
  { occurred_at: "2026-06-08T16:05:00.000Z", direction: "left_to_right" },
  { occurred_at: "2026-06-09T09:12:00.000Z", direction: "left_to_right" },
  { occurred_at: "2026-06-09T10:42:00.000Z", direction: "right_to_left" },
  { occurred_at: "2026-06-09T11:25:00.000Z", direction: "left_to_right" },
];

export const mockPassagesOverTime: Record<TimeGranularity, PassageTimeBucket[]> = {
  day: aggregatePassagesByPeriod(mockPassageEvents, "day"),
  week: aggregatePassagesByPeriod(mockPassageEvents, "week"),
  month: aggregatePassagesByPeriod(mockPassageEvents, "month"),
};

export const mockStats: StatsSummary = {
  passagesPerDay: [
    { date: "2026-06-07", passageCount: 41 },
    { date: "2026-06-08", passageCount: 56 },
    { date: "2026-06-09", passageCount: 24 },
  ],
  passagesPerHour: [
    { hour: "07:00", passageCount: 4 },
    { hour: "08:00", passageCount: 8 },
    { hour: "09:00", passageCount: 7 },
    { hour: "10:00", passageCount: 5 },
    { hour: "11:00", passageCount: 6 },
  ],
  passagesPerShipType: [
    { shipType: "ferry", passageCount: 38 },
    { shipType: "pleasure_craft", passageCount: 26 },
    { shipType: "cargo", passageCount: 11 },
    { shipType: "unknown", passageCount: 9 },
  ],
  mostFrequentShips: [
    { shipId: "ship-amstel-1", name: "IJveer 62", passageCount: 18 },
    { shipId: "ship-cargo-1", name: "Noordzee Trader", passageCount: 3 },
  ],
  newVsReturning: { newShips: 14, returningShips: 42 },
};
