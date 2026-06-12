import type { Ship, ShipType } from "./types";

/** Ruwe passage-event zoals opgehaald uit de database (laatste ~12 maanden). */
export type DashboardPassageEvent = {
  occurred_at: string;
  direction: string;
  detected_type: string;
  ship_id: string | null;
};

export type SeriesPoint = {
  label: string;
  fullLabel: string;
  total: number;
  towardIJmuiden: number;
  towardIJmeer: number;
};

export type DashboardStats = {
  total12Months: number;
  uniqueShips: number;
  kpis: {
    today: { total: number; trendPct: number | null };
    last7Days: { total: number; trendPct: number | null };
    peakHour: { label: string; avg: string } | null;
    peakWeekday: { label: string } | null;
  };
  recordDay: { label: string; count: number } | null;
  series: {
    today: SeriesPoint[];
    week: SeriesPoint[];
    month: SeriesPoint[];
    year: SeriesPoint[];
  };
  hourlyProfile: Array<{ hour: string; avg: number; today: number }>;
  heatmap: { cells: number[][]; max: number; weeks: number };
  shipTypes: Array<{ type: ShipType; count: number; sharePct: number }>;
  direction30d: { towardIJmuiden: number; towardIJmeer: number };
  newVsReturning: { newShips: number; returningShips: number };
  topShips: Array<{ id: string; name: string; type: ShipType; count: number }>;
};

export const WEEKDAY_LABELS_SHORT = ["ma", "di", "wo", "do", "vr", "za", "zo"];

const HEATMAP_WEEKS = 8;
const PROFILE_DAYS = 28;

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Amsterdam",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
});

function extractParts(date: Date) {
  const parts = partsFormatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";

  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    monthKey: `${get("year")}-${get("month")}`,
    hour: Number(get("hour")) % 24,
  };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** Datum (12:00 UTC) bij een dateKey, zodat labels nooit verschuiven door tijdzones. */
function dateFromKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function shiftDateKey(dateKey: string, days: number): string {
  const date = dateFromKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function shiftMonthKey(monthKey: string, months: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, 1, 12));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

/** Weekdag-index met maandag = 0. */
function weekdayFromKey(dateKey: string): number {
  return (dateFromKey(dateKey).getUTCDay() + 6) % 7;
}

const dayMonthFormatter = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", timeZone: "UTC" });
const weekdayLongFormatter = new Intl.DateTimeFormat("nl-NL", { weekday: "long", timeZone: "UTC" });
const fullDayFormatter = new Intl.DateTimeFormat("nl-NL", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
const recordDayFormatter = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const monthShortFormatter = new Intl.DateTimeFormat("nl-NL", { month: "short", timeZone: "UTC" });
const monthLongFormatter = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric", timeZone: "UTC" });
const avgFormatter = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 });

type DirectionCounts = { total: number; towardIJmuiden: number; towardIJmeer: number };

function emptyCounts(): DirectionCounts {
  return { total: 0, towardIJmuiden: 0, towardIJmeer: 0 };
}

function addToCounts(map: Map<string, DirectionCounts>, key: string, direction: string) {
  const counts = map.get(key) ?? emptyCounts();
  counts.total += 1;
  if (direction === "right_to_left") counts.towardIJmuiden += 1;
  else if (direction === "left_to_right") counts.towardIJmeer += 1;
  map.set(key, counts);
}

function countsFor(map: Map<string, DirectionCounts>, key: string): DirectionCounts {
  return map.get(key) ?? emptyCounts();
}

function trendPct(current: number, baseline: number): number | null {
  if (baseline <= 0) return null;
  return Math.round(((current - baseline) / baseline) * 100);
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

export function buildDashboardStats(
  events: DashboardPassageEvent[],
  ships: Ship[],
  now = new Date(),
): DashboardStats {
  const byDate = new Map<string, DirectionCounts>();
  const byMonth = new Map<string, DirectionCounts>();
  const byDateHour = new Map<string, DirectionCounts>();

  const nowParts = extractParts(now);
  const todayKey = nowParts.dateKey;
  const currentHour = nowParts.hour;
  const last30Keys = new Set(Array.from({ length: 30 }, (_, offset) => shiftDateKey(todayKey, -offset)));

  const shipById = new Map(ships.map((ship) => [ship.id, ship]));
  const byType30d = new Map<string, number>();
  const direction30d = { towardIJmuiden: 0, towardIJmeer: 0 };
  let newShips30d = 0;
  let returningShips30d = 0;

  for (const event of events) {
    const parts = extractParts(new Date(event.occurred_at));
    addToCounts(byDate, parts.dateKey, event.direction);
    addToCounts(byMonth, parts.monthKey, event.direction);
    addToCounts(byDateHour, `${parts.dateKey}|${parts.hour}`, event.direction);

    if (last30Keys.has(parts.dateKey)) {
      byType30d.set(event.detected_type, (byType30d.get(event.detected_type) ?? 0) + 1);
      if (event.direction === "right_to_left") direction30d.towardIJmuiden += 1;
      else if (event.direction === "left_to_right") direction30d.towardIJmeer += 1;

      const ship = event.ship_id ? shipById.get(event.ship_id) : null;
      if (!ship || ship.passageCount <= 1) newShips30d += 1;
      else returningShips30d += 1;
    }
  }

  // KPI: vandaag, vergeleken met een gemiddelde dag tot hetzelfde uur (laatste 28 dagen).
  const todayTotal = countsFor(byDate, todayKey).total;
  let baselineUpToNow = 0;
  let baselineDaysWithData = 0;
  for (let offset = 1; offset <= PROFILE_DAYS; offset++) {
    const key = shiftDateKey(todayKey, -offset);
    if (countsFor(byDate, key).total > 0) baselineDaysWithData += 1;
    for (let hour = 0; hour <= currentHour; hour++) {
      baselineUpToNow += countsFor(byDateHour, `${key}|${hour}`).total;
    }
  }
  // Pas een trend tonen zodra er ten minste een week aan historie is, anders is het percentage misleidend.
  const todayTrend =
    baselineDaysWithData >= 7 ? trendPct(todayTotal, baselineUpToNow / PROFILE_DAYS) : null;

  // KPI: laatste 7 dagen vs de 7 dagen ervoor.
  let last7 = 0;
  let previous7 = 0;
  for (let offset = 0; offset < 7; offset++) {
    last7 += countsFor(byDate, shiftDateKey(todayKey, -offset)).total;
    previous7 += countsFor(byDate, shiftDateKey(todayKey, -offset - 7)).total;
  }

  // Verloop: vandaag per uur.
  const todaySeries: SeriesPoint[] = Array.from({ length: 24 }, (_, hour) => ({
    label: `${pad(hour)}:00`,
    fullLabel: `Vandaag ${pad(hour)}:00 – ${pad((hour + 1) % 24)}:00`,
    ...countsFor(byDateHour, `${todayKey}|${hour}`),
  }));

  // Verloop: laatste 7 of 30 dagen, per dag.
  const buildDailySeries = (days: number): SeriesPoint[] =>
    Array.from({ length: days }, (_, index) => {
      const key = shiftDateKey(todayKey, -(days - 1 - index));
      const date = dateFromKey(key);
      return {
        label: days <= 7 ? WEEKDAY_LABELS_SHORT[weekdayFromKey(key)] : dayMonthFormatter.format(date),
        fullLabel: fullDayFormatter.format(date),
        ...countsFor(byDate, key),
      };
    });

  // Verloop: laatste 12 maanden, per maand.
  const yearSeries: SeriesPoint[] = Array.from({ length: 12 }, (_, index) => {
    const key = shiftMonthKey(nowParts.monthKey, -(11 - index));
    const date = dateFromKey(`${key}-01`);
    return {
      label: monthShortFormatter.format(date),
      fullLabel: monthLongFormatter.format(date),
      ...countsFor(byMonth, key),
    };
  });

  // Gemiddeld dagverloop per uur over de laatste 28 dagen, plus vandaag.
  const hourlyProfile = Array.from({ length: 24 }, (_, hour) => {
    let sum = 0;
    for (let offset = 1; offset <= PROFILE_DAYS; offset++) {
      sum += countsFor(byDateHour, `${shiftDateKey(todayKey, -offset)}|${hour}`).total;
    }
    return {
      hour: `${pad(hour)}:00`,
      avg: round1(sum / PROFILE_DAYS),
      today: countsFor(byDateHour, `${todayKey}|${hour}`).total,
    };
  });

  // Heatmap: totalen per weekdag en uur over de laatste 8 volledige weken.
  const heatmapCells: number[][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (let offset = 1; offset <= HEATMAP_WEEKS * 7; offset++) {
    const key = shiftDateKey(todayKey, -offset);
    const weekday = weekdayFromKey(key);
    for (let hour = 0; hour < 24; hour++) {
      heatmapCells[weekday][hour] += countsFor(byDateHour, `${key}|${hour}`).total;
    }
  }
  const heatmapMax = Math.max(...heatmapCells.flat(), 0);

  // KPI: piekuur op basis van het gemiddelde dagverloop.
  const peakHourPoint = hourlyProfile.reduce(
    (best, point) => (point.avg > (best?.avg ?? 0) ? point : best),
    null as (typeof hourlyProfile)[number] | null,
  );
  const peakHour = peakHourPoint && peakHourPoint.avg > 0
    ? { label: peakHourPoint.hour, avg: avgFormatter.format(peakHourPoint.avg) }
    : null;

  // KPI: drukste weekdag op basis van de heatmap.
  let peakWeekday: DashboardStats["kpis"]["peakWeekday"] = null;
  let peakWeekdayTotal = 0;
  heatmapCells.forEach((row, weekday) => {
    const total = row.reduce((sum, value) => sum + value, 0);
    if (total > peakWeekdayTotal) {
      peakWeekdayTotal = total;
      const sampleKey = shiftDateKey(todayKey, -(((weekdayFromKey(todayKey) - weekday + 7) % 7) || 7));
      peakWeekday = { label: weekdayLongFormatter.format(dateFromKey(sampleKey)) };
    }
  });

  // Record: drukste dag in het hele opgehaalde venster.
  let recordDay: DashboardStats["recordDay"] = null;
  for (const [key, counts] of byDate) {
    if (!recordDay || counts.total > recordDay.count) {
      recordDay = { label: recordDayFormatter.format(dateFromKey(key)), count: counts.total };
    }
  }

  const typeTotal = [...byType30d.values()].reduce((sum, count) => sum + count, 0);
  const shipTypes = [...byType30d.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({
      type: type as ShipType,
      count,
      sharePct: typeTotal > 0 ? Math.round((count / typeTotal) * 100) : 0,
    }));

  const topShips = [...ships]
    .filter((ship) => ship.passageCount > 0)
    .sort((a, b) => b.passageCount - a.passageCount)
    .slice(0, 5)
    .map((ship) => ({
      id: ship.id,
      name: ship.name ?? ship.mmsi ?? "Onbekend schip",
      type: ship.shipType,
      count: ship.passageCount,
    }));

  return {
    total12Months: events.length,
    uniqueShips: ships.length,
    kpis: {
      today: { total: todayTotal, trendPct: todayTrend },
      last7Days: { total: last7, trendPct: trendPct(last7, previous7) },
      peakHour,
      peakWeekday,
    },
    recordDay,
    series: {
      today: todaySeries,
      week: buildDailySeries(7),
      month: buildDailySeries(30),
      year: yearSeries,
    },
    hourlyProfile,
    heatmap: { cells: heatmapCells, max: heatmapMax, weeks: HEATMAP_WEEKS },
    shipTypes,
    direction30d,
    newVsReturning: { newShips: newShips30d, returningShips: returningShips30d },
    topShips,
  };
}
