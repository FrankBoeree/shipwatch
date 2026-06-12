import type { DashboardPassageEvent } from "./dashboard-stats";
import { aggregatePassagesByPeriod, getAmsterdamDateKey, getPeriodKey } from "./passage-stats";
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

// Deterministic pseudo-random generator so the demo dashboard always shows the same realistic data.
function createSeededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function generateMockDashboardEvents(): DashboardPassageEvent[] {
  const random = createSeededRandom(42);
  const events: DashboardPassageEvent[] = [];
  const types = ["ferry", "pleasure_craft", "cargo", "sailboat", "tour_boat", "container", "tanker", "unknown"];
  const typeWeights = [0.3, 0.22, 0.16, 0.1, 0.08, 0.06, 0.04, 0.04];
  const now = new Date();

  for (let daysAgo = 364; daysAgo >= 0; daysAgo -= 1) {
    const day = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    const month = day.getMonth();
    const weekday = day.getDay();

    // Seasonal swell in summer, extra recreational traffic in weekends.
    const seasonFactor = 0.65 + 0.6 * Math.sin(((month - 2) / 12) * Math.PI * 2 * 0.5 + 0.4);
    const weekendFactor = weekday === 0 || weekday === 6 ? 1.35 : 1;
    const baseCount = Math.round((18 + random() * 14) * seasonFactor * weekendFactor);

    for (let i = 0; i < baseCount; i += 1) {
      // Daytime peak around 14:00.
      const hour = Math.min(23, Math.max(0, Math.round(13.5 + (random() + random() - 1) * 6)));
      const minute = Math.floor(random() * 60);
      const occurred = new Date(day);
      occurred.setHours(hour, minute, Math.floor(random() * 60), 0);
      if (occurred > now) continue;

      let typeRoll = random();
      let typeIndex = 0;
      while (typeIndex < typeWeights.length - 1 && typeRoll > typeWeights[typeIndex]) {
        typeRoll -= typeWeights[typeIndex];
        typeIndex += 1;
      }

      events.push({
        occurred_at: occurred.toISOString(),
        direction: random() > 0.48 ? "left_to_right" : "right_to_left",
        detected_type: types[typeIndex],
        ship_id: random() > 0.55 ? (random() > 0.5 ? "ship-amstel-1" : "ship-cargo-1") : null,
      });
    }
  }

  return events;
}

export const mockDashboardEvents: DashboardPassageEvent[] = generateMockDashboardEvents();

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
  passagesToday: (() => {
    const todayKey = getAmsterdamDateKey();
    const todayEvents = mockPassageEvents.filter((event) => getPeriodKey(event.occurred_at, "day") === todayKey);

    return {
      total: todayEvents.length,
      towardIJmuiden: todayEvents.filter((event) => event.direction === "right_to_left").length,
      towardIJmeer: todayEvents.filter((event) => event.direction === "left_to_right").length,
    };
  })(),
};
