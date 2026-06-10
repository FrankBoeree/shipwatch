import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

function loadEnvFile(filename) {
  try {
    const content = readFileSync(resolve(process.cwd(), filename), "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator === -1) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // Optional local env file.
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const FRAME_WIDTH = Number(process.env.CAPTURE_FRAME_WIDTH ?? "1280");
const FRAME_HEIGHT = Number(process.env.CAPTURE_FRAME_HEIGHT ?? "720");

const CARGO_MIN_WIDTH_RATIO = 0.22;
const CARGO_MIN_AREA_RATIO = 0.055;
const SMALL_MAX_WIDTH_RATIO = 0.12;
const SAIL_MAX_ASPECT_RATIO = 0.95;

function classifyShipType(bbox, frameWidth, frameHeight) {
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

function parseBbox(value) {
  if (Array.isArray(value)) {
    return value.map(Number);
  }

  return JSON.parse(String(value).replace(/'/g, '"'));
}

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://shipwatch:shipwatch@localhost:5432/shipwatch";

const pool = new pg.Pool({ connectionString });
const client = await pool.connect();

try {
  const result = await client.query(`
    select p.id, pp.bbox
      from public_passages p
      join passage_photos pp on pp.passage_id = p.id
     where p.detected_type = 'unknown'
     order by p.occurred_at desc
  `);

  const supabase =
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;

  let updated = 0;

  for (const row of result.rows) {
    const detectedType = classifyShipType(parseBbox(row.bbox), FRAME_WIDTH, FRAME_HEIGHT);
    await client.query(`update public_passages set detected_type = $1 where id = $2`, [detectedType, row.id]);

    if (supabase) {
      const { error } = await supabase
        .from("public_passages")
        .update({ detected_type: detectedType })
        .eq("id", row.id);

      if (error) {
        console.error(`${row.id}: supabase update failed: ${error.message}`);
      }
    }

    console.log(`${row.id}: ${detectedType}`);
    updated += 1;
  }

  console.log(`Updated ${updated} local passage(s).`);
} finally {
  client.release();
  await pool.end();
}
