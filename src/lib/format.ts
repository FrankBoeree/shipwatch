import { directionLabels, shipTypeLabels, type Direction, type ShipType, type TimeGranularity } from "./types";

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Amsterdam",
  }).format(new Date(value));
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Europe/Amsterdam",
  }).format(new Date(value));
}

export function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function labelShipType(type: ShipType) {
  return shipTypeLabels[type] ?? shipTypeLabels.unknown;
}

export function labelDirection(direction: Direction) {
  return directionLabels[direction] ?? directionLabels.unknown;
}

const shortDateFormatter = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/Amsterdam",
});

const monthFormatter = new Intl.DateTimeFormat("nl-NL", {
  month: "short",
  year: "numeric",
  timeZone: "Europe/Amsterdam",
});

export function formatPeriodLabel(period: string, granularity: TimeGranularity) {
  const date = new Date(`${period}T12:00:00`);

  if (granularity === "month") {
    return monthFormatter.format(date);
  }

  if (granularity === "week") {
    const weekEnd = new Date(date);
    weekEnd.setDate(weekEnd.getDate() + 6);
    return `${shortDateFormatter.format(date)} – ${shortDateFormatter.format(weekEnd)}`;
  }

  return shortDateFormatter.format(date);
}
