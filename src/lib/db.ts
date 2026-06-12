import { Pool } from "pg";
import path from "path";
import type { Passage, PassageTimeBucket, Ship, StatsSummary, TimeGranularity } from "./types";
import {
  getDashboardEventsFromSupabase,
  getLiveSnapshotFromSupabase,
  getPassageFromSupabase,
  getPassagesOverTimeFromSupabase,
  getShipFromSupabase,
  getStatsSummaryFromSupabase,
  listPassagesFromSupabase,
  listPassagesPageFromSupabase,
  listShipsFromSupabase,
} from "./db-supabase";
import type { DashboardPassageEvent } from "./dashboard-stats";
import { mockDashboardEvents, mockPassages, mockPassagesOverTime, mockShips, mockStats } from "./mock-data";

let pool: Pool | null = null;

function getPool() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    return null;
  }

  if (!pool) {
    pool = new Pool({ connectionString });
  }

  return pool;
}

function mapPassage(row: Record<string, unknown>): Passage {
  const rawPhotoUrl = row.photo_url ? String(row.photo_url) : null;

  return {
    id: String(row.id),
    shipId: row.ship_id ? String(row.ship_id) : null,
    occurredAt: new Date(String(row.occurred_at)).toISOString(),
    direction: String(row.direction ?? "unknown") as Passage["direction"],
    detectionConfidence: Number(row.detection_confidence ?? 0),
    detectedType: String(row.detected_type ?? "unknown") as Passage["detectedType"],
    identificationStatus: String(row.identification_status ?? "unknown") as Passage["identificationStatus"],
    photoUrl: rawPhotoUrl?.startsWith("/data/photos/")
      ? `/api/photos/${encodeURIComponent(path.basename(rawPhotoUrl))}`
      : rawPhotoUrl,
    shipName: row.ship_name ? String(row.ship_name) : null,
    mmsi: row.mmsi ? String(row.mmsi) : null,
  };
}

function mapShip(row: Record<string, unknown>): Ship {
  return {
    id: String(row.id),
    mmsi: row.mmsi ? String(row.mmsi) : null,
    imo: row.imo ? String(row.imo) : null,
    name: row.name ? String(row.name) : null,
    shipType: String(row.ship_type ?? "unknown") as Ship["shipType"],
    lengthM: row.length_m === null || row.length_m === undefined ? null : Number(row.length_m),
    widthM: row.width_m === null || row.width_m === undefined ? null : Number(row.width_m),
    firstSeenAt: new Date(String(row.first_seen_at)).toISOString(),
    lastSeenAt: new Date(String(row.last_seen_at)).toISOString(),
    passageCount: Number(row.passage_count ?? 0),
  };
}

export async function listPassages(limit = 30): Promise<Passage[]> {
  const db = getPool();

  if (db) {
    try {
      const result = await db.query(
        `select p.id, p.ship_id, p.occurred_at, p.direction, p.detection_confidence,
                p.detected_type, p.identification_status, p.photo_url,
                s.name as ship_name, s.mmsi
           from public_passages p
           left join public_ships s on s.id = p.ship_id
          order by p.occurred_at desc
          limit $1`,
        [limit],
      );

      return result.rows.map(mapPassage);
    } catch {
      // Fall back to Supabase when local Postgres is unavailable or misconfigured.
    }
  }

  const fromSupabase = await listPassagesFromSupabase(limit, mapPassage);
  if (fromSupabase) {
    return fromSupabase;
  }

  return mockPassages.slice(0, limit);
}

export async function listPassagesPage(
  page: number,
  pageSize: number,
): Promise<{ passages: Passage[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const db = getPool();

  if (db) {
    try {
      const result = await db.query(
        `select p.id, p.ship_id, p.occurred_at, p.direction, p.detection_confidence,
                p.detected_type, p.identification_status, p.photo_url,
                s.name as ship_name, s.mmsi,
                count(*) over()::int as total_count
           from public_passages p
           left join public_ships s on s.id = p.ship_id
          order by p.occurred_at desc
          limit $1 offset $2`,
        [pageSize, offset],
      );

      return {
        passages: result.rows.map(mapPassage),
        total: Number(result.rows[0]?.total_count ?? 0),
      };
    } catch {
      // Fall back to Supabase when local Postgres is unavailable or misconfigured.
    }
  }

  const fromSupabase = await listPassagesPageFromSupabase(offset, pageSize, mapPassage);
  if (fromSupabase) {
    return fromSupabase;
  }

  return {
    passages: mockPassages.slice(offset, offset + pageSize),
    total: mockPassages.length,
  };
}

export async function getPassage(id: string): Promise<Passage | null> {
  const db = getPool();

  if (db) {
    try {
      const result = await db.query(
        `select p.id, p.ship_id, p.occurred_at, p.direction, p.detection_confidence,
                p.detected_type, p.identification_status, p.photo_url,
                s.name as ship_name, s.mmsi
           from public_passages p
           left join public_ships s on s.id = p.ship_id
          where p.id = $1
          limit 1`,
        [id],
      );

      return result.rows[0] ? mapPassage(result.rows[0]) : null;
    } catch {
      // Fall back to Supabase when local Postgres is unavailable or misconfigured.
    }
  }

  const fromSupabase = await getPassageFromSupabase(id, mapPassage);
  if (fromSupabase) {
    return fromSupabase;
  }

  return mockPassages.find((passage) => passage.id === id) ?? null;
}

export async function listShips(): Promise<Ship[]> {
  const db = getPool();

  if (db) {
    try {
      const result = await db.query(
        `select id, mmsi, imo, name, ship_type, length_m, width_m,
                first_seen_at, last_seen_at, passage_count
           from public_ships
          order by passage_count desc, last_seen_at desc`,
      );

      return result.rows.map(mapShip);
    } catch {
      // Fall back to Supabase when local Postgres is unavailable or misconfigured.
    }
  }

  const fromSupabase = await listShipsFromSupabase(mapShip);
  if (fromSupabase) {
    return fromSupabase;
  }

  return mockShips;
}

export async function getShip(id: string): Promise<Ship | null> {
  const db = getPool();

  if (db) {
    try {
      const result = await db.query(
        `select id, mmsi, imo, name, ship_type, length_m, width_m,
                first_seen_at, last_seen_at, passage_count
           from public_ships
          where id = $1
          limit 1`,
        [id],
      );

      return result.rows[0] ? mapShip(result.rows[0]) : null;
    } catch {
      // Fall back to Supabase when local Postgres is unavailable or misconfigured.
    }
  }

  const fromSupabase = await getShipFromSupabase(id, mapShip);
  if (fromSupabase) {
    return fromSupabase;
  }

  return mockShips.find((ship) => ship.id === id) ?? null;
}

function mapTimeBucket(row: Record<string, unknown>): PassageTimeBucket {
  return {
    period: String(row.period),
    total: Number(row.total),
    leftToRight: Number(row.left_to_right),
    rightToLeft: Number(row.right_to_left),
  };
}

const timeGranularityQueries: Record<
  TimeGranularity,
  { interval: string; trunc: string; limit: number }
> = {
  day: {
    interval: "29 days",
    trunc: "(occurred_at at time zone 'Europe/Amsterdam')::date",
    limit: 30,
  },
  week: {
    interval: "11 weeks",
    trunc: "date_trunc('week', occurred_at at time zone 'Europe/Amsterdam')::date",
    limit: 12,
  },
  month: {
    interval: "11 months",
    trunc: "date_trunc('month', occurred_at at time zone 'Europe/Amsterdam')::date",
    limit: 12,
  },
};

export async function getPassagesOverTime(granularity: TimeGranularity): Promise<PassageTimeBucket[]> {
  const db = getPool();
  const config = timeGranularityQueries[granularity];

  if (db) {
    try {
      const result = await db.query(
        `select ${config.trunc}::text as period,
                count(*)::int as total,
                count(*) filter (where direction = 'left_to_right')::int as left_to_right,
                count(*) filter (where direction = 'right_to_left')::int as right_to_left
           from public_passages
          where occurred_at >= (now() at time zone 'Europe/Amsterdam' - interval '${config.interval}')::timestamptz
          group by 1
          order by 1 asc
          limit $1`,
        [config.limit],
      );

      return result.rows.map(mapTimeBucket);
    } catch {
      // Fall back to Supabase when local Postgres is unavailable or misconfigured.
    }
  }

  const fromSupabase = await getPassagesOverTimeFromSupabase(granularity);
  if (fromSupabase) {
    return fromSupabase;
  }

  return mockPassagesOverTime[granularity];
}

export async function getStatsSummary(): Promise<StatsSummary> {
  const db = getPool();

  if (db) {
    try {
      const [daily, hourly, byType, frequent, newReturning, today] = await Promise.all([
        db.query(
          `select occurred_at::date::text as date, count(*)::int as passage_count
             from public_passages
            group by occurred_at::date
            order by occurred_at::date desc
            limit 14`,
        ),
        db.query(
          `select to_char(date_trunc('hour', occurred_at), 'HH24:00') as hour,
                  count(*)::int as passage_count
             from public_passages
            group by date_trunc('hour', occurred_at)
            order by date_trunc('hour', occurred_at) asc`,
        ),
        db.query(
          `select detected_type as ship_type, count(*)::int as passage_count
             from public_passages
            group by detected_type
            order by passage_count desc`,
        ),
        db.query(
          `select id as ship_id, coalesce(name, mmsi, 'Onbekend schip') as name, passage_count
             from public_ships
            order by passage_count desc
            limit 10`,
        ),
        db.query(
          `select
             count(*) filter (where s.passage_count <= 1 or p.ship_id is null) as new_ships,
             count(*) filter (where s.passage_count > 1) as returning_ships
           from public_passages p
           left join public_ships s on s.id = p.ship_id`,
        ),
        db.query(
          `select
             count(*)::int as total,
             count(*) filter (where direction = 'right_to_left')::int as toward_ijmuiden,
             count(*) filter (where direction = 'left_to_right')::int as toward_ijmeer
           from public_passages
          where (occurred_at at time zone 'Europe/Amsterdam')::date
              = (now() at time zone 'Europe/Amsterdam')::date`,
        ),
      ]);

      return {
        passagesPerDay: daily.rows.map((row) => ({
          date: String(row.date),
          passageCount: Number(row.passage_count),
        })),
        passagesPerHour: hourly.rows.map((row) => ({
          hour: String(row.hour),
          passageCount: Number(row.passage_count),
        })),
        passagesPerShipType: byType.rows.map((row) => ({
          shipType: String(row.ship_type) as StatsSummary["passagesPerShipType"][number]["shipType"],
          passageCount: Number(row.passage_count),
        })),
        mostFrequentShips: frequent.rows.map((row) => ({
          shipId: String(row.ship_id),
          name: String(row.name),
          passageCount: Number(row.passage_count),
        })),
        newVsReturning: {
          newShips: Number(newReturning.rows[0]?.new_ships ?? 0),
          returningShips: Number(newReturning.rows[0]?.returning_ships ?? 0),
        },
        passagesToday: {
          total: Number(today.rows[0]?.total ?? 0),
          towardIJmuiden: Number(today.rows[0]?.toward_ijmuiden ?? 0),
          towardIJmeer: Number(today.rows[0]?.toward_ijmeer ?? 0),
        },
      };
    } catch {
      // Fall back to Supabase when local Postgres is unavailable or misconfigured.
    }
  }

  const fromSupabase = await getStatsSummaryFromSupabase();
  if (fromSupabase) {
    return fromSupabase;
  }

  return mockStats;
}

export async function getDashboardEvents(): Promise<DashboardPassageEvent[]> {
  const db = getPool();

  if (db) {
    try {
      const result = await db.query(
        `select occurred_at, direction, detected_type, ship_id
           from public_passages
          where occurred_at >= now() - interval '370 days'
          order by occurred_at asc`,
      );

      return result.rows.map((row) => ({
        occurred_at: new Date(String(row.occurred_at)).toISOString(),
        direction: String(row.direction ?? "unknown"),
        detected_type: String(row.detected_type ?? "unknown"),
        ship_id: row.ship_id ? String(row.ship_id) : null,
      }));
    } catch {
      // Fall back to Supabase when local Postgres is unavailable or misconfigured.
    }
  }

  const fromSupabase = await getDashboardEventsFromSupabase();
  if (fromSupabase) {
    return fromSupabase;
  }

  return mockDashboardEvents;
}

export async function getLiveSnapshot() {
  const db = getPool();

  if (db) {
    try {
      const result = await db.query(
        `select latest_snapshot_url, latest_snapshot_updated_at, last_sync_at
           from public_runtime_status
          where id = 'public'
          limit 1`,
      );

      const row = result.rows[0];

      return {
        latestSnapshotUrl: row?.latest_snapshot_url ? String(row.latest_snapshot_url) : null,
        latestSnapshotUpdatedAt: row?.latest_snapshot_updated_at
          ? new Date(String(row.latest_snapshot_updated_at)).toISOString()
          : null,
        lastSyncAt: row?.last_sync_at ? new Date(String(row.last_sync_at)).toISOString() : null,
      };
    } catch {
      // Fall back to Supabase when local Postgres is unavailable or misconfigured.
    }
  }

  const fromSupabase = await getLiveSnapshotFromSupabase();
  if (fromSupabase) {
    return fromSupabase;
  }

  return {
    latestSnapshotUrl: null,
    latestSnapshotUpdatedAt: null,
    lastSyncAt: null,
  };
}
