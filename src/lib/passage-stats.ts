import type { PassageTimeBucket, TimeGranularity } from "./types";

const amsterdamDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Amsterdam",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function amsterdamDateParts(value: Date) {
  const [year, month, day] = amsterdamDateFormatter.format(value).split("-").map(Number);
  return { year, month, day };
}

function toDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getAmsterdamDateKey(value: Date = new Date()) {
  const { year, month, day } = amsterdamDateParts(value);
  return toDateKey(year, month, day);
}

export function getPeriodKey(occurredAt: string, granularity: TimeGranularity): string {
  const { year, month, day } = amsterdamDateParts(new Date(occurredAt));

  if (granularity === "day") {
    return toDateKey(year, month, day);
  }

  if (granularity === "month") {
    return toDateKey(year, month, 1);
  }

  const date = new Date(year, month - 1, day);
  const weekday = date.getDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  date.setDate(date.getDate() + mondayOffset);

  return toDateKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function aggregatePassagesByPeriod(
  passages: Array<{ occurred_at: string; direction: string }>,
  granularity: TimeGranularity,
): PassageTimeBucket[] {
  const buckets = new Map<string, PassageTimeBucket>();

  for (const passage of passages) {
    const period = getPeriodKey(passage.occurred_at, granularity);
    const bucket = buckets.get(period) ?? {
      period,
      total: 0,
      leftToRight: 0,
      rightToLeft: 0,
    };

    bucket.total += 1;
    if (passage.direction === "left_to_right") {
      bucket.leftToRight += 1;
    } else if (passage.direction === "right_to_left") {
      bucket.rightToLeft += 1;
    }

    buckets.set(period, bucket);
  }

  return [...buckets.values()].sort((a, b) => a.period.localeCompare(b.period));
}

export function limitBuckets(buckets: PassageTimeBucket[], granularity: TimeGranularity) {
  const limit = granularity === "day" ? 30 : 12;
  return buckets.slice(-limit);
}
