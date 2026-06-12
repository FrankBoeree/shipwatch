import type { SupabaseClient } from "@supabase/supabase-js";
import type { Passage, PassageTimeBucket, Ship, StatsSummary, TimeGranularity } from "./types";
import type { DashboardPassageEvent } from "./dashboard-stats";
import { aggregatePassagesByPeriod, getAmsterdamDateKey, getPeriodKey, limitBuckets } from "./passage-stats";
import { getSupabaseAdmin } from "./supabase-admin";

type ShipEmbed = { name: string | null; mmsi: string | null };
type PassageRow = {
  id: string;
  ship_id: string | null;
  occurred_at: string;
  direction: string;
  detection_confidence: number;
  detected_type: string;
  identification_status: string;
  photo_url: string | null;
  public_ships: ShipEmbed | ShipEmbed[] | null;
};

export function getSupabaseReader(): SupabaseClient | null {
  return getSupabaseAdmin();
}

function shipEmbed(row: PassageRow): ShipEmbed | null {
  if (!row.public_ships) return null;
  return Array.isArray(row.public_ships) ? (row.public_ships[0] ?? null) : row.public_ships;
}

export function mapSupabasePassage(row: PassageRow, mapPassage: (row: Record<string, unknown>) => Passage): Passage {
  const linkedShip = shipEmbed(row);

  return mapPassage({
    id: row.id,
    ship_id: row.ship_id,
    occurred_at: row.occurred_at,
    direction: row.direction,
    detection_confidence: row.detection_confidence,
    detected_type: row.detected_type,
    identification_status: row.identification_status,
    photo_url: row.photo_url,
    ship_name: linkedShip?.name ?? null,
    mmsi: linkedShip?.mmsi ?? null,
  });
}

export async function listPassagesFromSupabase(
  limit: number,
  mapPassage: (row: Record<string, unknown>) => Passage,
): Promise<Passage[] | null> {
  const supabase = getSupabaseReader();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("public_passages")
    .select(
      "id, ship_id, occurred_at, direction, detection_confidence, detected_type, identification_status, photo_url, public_ships(name, mmsi)",
    )
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) return null;

  return (data as unknown as PassageRow[]).map((row) => mapSupabasePassage(row, mapPassage));
}

export async function listPassagesPageFromSupabase(
  offset: number,
  limit: number,
  mapPassage: (row: Record<string, unknown>) => Passage,
): Promise<{ passages: Passage[]; total: number } | null> {
  const supabase = getSupabaseReader();
  if (!supabase) return null;

  const { data, error, count } = await supabase
    .from("public_passages")
    .select(
      "id, ship_id, occurred_at, direction, detection_confidence, detected_type, identification_status, photo_url, public_ships(name, mmsi)",
      { count: "exact" },
    )
    .order("occurred_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return null;

  return {
    passages: (data as unknown as PassageRow[]).map((row) => mapSupabasePassage(row, mapPassage)),
    total: count ?? 0,
  };
}

export async function getPassageFromSupabase(
  id: string,
  mapPassage: (row: Record<string, unknown>) => Passage,
): Promise<Passage | null | null> {
  const supabase = getSupabaseReader();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("public_passages")
    .select(
      "id, ship_id, occurred_at, direction, detection_confidence, detected_type, identification_status, photo_url, public_ships(name, mmsi)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return error ? null : null;

  return mapSupabasePassage(data as unknown as PassageRow, mapPassage);
}

export async function listShipsFromSupabase(
  mapShip: (row: Record<string, unknown>) => Ship,
): Promise<Ship[] | null> {
  const supabase = getSupabaseReader();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("public_ships")
    .select("id, mmsi, imo, name, ship_type, length_m, width_m, first_seen_at, last_seen_at, passage_count")
    .order("passage_count", { ascending: false })
    .order("last_seen_at", { ascending: false });

  if (error) return null;

  return data.map((row) => mapShip(row as Record<string, unknown>));
}

export async function getShipFromSupabase(
  id: string,
  mapShip: (row: Record<string, unknown>) => Ship,
): Promise<Ship | null | null> {
  const supabase = getSupabaseReader();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("public_ships")
    .select("id, mmsi, imo, name, ship_type, length_m, width_m, first_seen_at, last_seen_at, passage_count")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  return mapShip(data as Record<string, unknown>);
}

export async function getPassagesOverTimeFromSupabase(
  granularity: TimeGranularity,
): Promise<PassageTimeBucket[] | null> {
  const supabase = getSupabaseReader();
  if (!supabase) return null;

  const { data, error } = await supabase.from("public_passages").select("occurred_at, direction");

  if (error || !data) return null;

  return limitBuckets(aggregatePassagesByPeriod(data, granularity), granularity);
}

export async function getDashboardEventsFromSupabase(): Promise<DashboardPassageEvent[] | null> {
  const supabase = getSupabaseReader();
  if (!supabase) return null;

  const since = new Date(Date.now() - 370 * 24 * 60 * 60 * 1000).toISOString();
  const pageSize = 1000;
  const events: DashboardPassageEvent[] = [];

  // Supabase caps responses at 1000 rows, so page through the result set.
  for (let page = 0; page < 50; page += 1) {
    const { data, error } = await supabase
      .from("public_passages")
      .select("occurred_at, direction, detected_type, ship_id")
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) return page === 0 ? null : events;
    if (!data || data.length === 0) break;

    for (const row of data) {
      events.push({
        occurred_at: String(row.occurred_at),
        direction: String(row.direction ?? "unknown"),
        detected_type: String(row.detected_type ?? "unknown"),
        ship_id: row.ship_id ? String(row.ship_id) : null,
      });
    }

    if (data.length < pageSize) break;
  }

  return events;
}

export async function getStatsSummaryFromSupabase(): Promise<StatsSummary | null> {
  const supabase = getSupabaseReader();
  if (!supabase) return null;

  const [passagesResult, shipsResult] = await Promise.all([
    supabase.from("public_passages").select("occurred_at, detected_type, ship_id, direction"),
    supabase
      .from("public_ships")
      .select("id, name, mmsi, passage_count")
      .order("passage_count", { ascending: false })
      .limit(10),
  ]);

  if (passagesResult.error || shipsResult.error) return null;

  const passages = passagesResult.data ?? [];
  const ships = shipsResult.data ?? [];
  const shipById = new Map(ships.map((ship) => [ship.id, ship]));

  const daily = new Map<string, number>();
  const hourly = new Map<string, number>();
  const byType = new Map<string, number>();
  let newShips = 0;
  let returningShips = 0;
  let passagesTodayTotal = 0;
  let towardIJmuiden = 0;
  let towardIJmeer = 0;
  const todayKey = getAmsterdamDateKey();

  for (const passage of passages) {
    const occurredAt = new Date(passage.occurred_at);
    const dateKey = getPeriodKey(passage.occurred_at, "day");
    const hourKey = `${String(occurredAt.getUTCHours()).padStart(2, "0")}:00`;

    daily.set(dateKey, (daily.get(dateKey) ?? 0) + 1);
    hourly.set(hourKey, (hourly.get(hourKey) ?? 0) + 1);
    byType.set(passage.detected_type, (byType.get(passage.detected_type) ?? 0) + 1);

    const ship = passage.ship_id ? shipById.get(passage.ship_id) : null;
    if (!ship || (ship.passage_count ?? 0) <= 1) {
      newShips += 1;
    } else {
      returningShips += 1;
    }

    if (dateKey === todayKey) {
      passagesTodayTotal += 1;
      if (passage.direction === "right_to_left") {
        towardIJmuiden += 1;
      } else if (passage.direction === "left_to_right") {
        towardIJmeer += 1;
      }
    }
  }

  return {
    passagesPerDay: [...daily.entries()]
      .map(([date, passageCount]) => ({ date, passageCount }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 14),
    passagesPerHour: [...hourly.entries()]
      .map(([hour, passageCount]) => ({ hour, passageCount }))
      .sort((a, b) => a.hour.localeCompare(b.hour)),
    passagesPerShipType: [...byType.entries()]
      .map(([shipType, passageCount]) => ({
        shipType: shipType as StatsSummary["passagesPerShipType"][number]["shipType"],
        passageCount,
      }))
      .sort((a, b) => b.passageCount - a.passageCount),
    mostFrequentShips: ships.map((ship) => ({
      shipId: ship.id,
      name: ship.name ?? ship.mmsi ?? "Onbekend schip",
      passageCount: ship.passage_count ?? 0,
    })),
    newVsReturning: { newShips, returningShips },
    passagesToday: {
      total: passagesTodayTotal,
      towardIJmuiden,
      towardIJmeer,
    },
  };
}

export async function getLiveSnapshotFromSupabase() {
  const supabase = getSupabaseReader();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("public_runtime_status")
    .select("latest_snapshot_url, latest_snapshot_updated_at, last_sync_at")
    .eq("id", "public")
    .maybeSingle();

  if (error || !data) return null;

  return {
    latestSnapshotUrl: data.latest_snapshot_url ? String(data.latest_snapshot_url) : null,
    latestSnapshotUpdatedAt: data.latest_snapshot_updated_at
      ? new Date(String(data.latest_snapshot_updated_at)).toISOString()
      : null,
    lastSyncAt: data.last_sync_at ? new Date(String(data.last_sync_at)).toISOString() : null,
  };
}
