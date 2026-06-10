import { z } from "zod";
import { corsJson, corsOptions } from "@/lib/sync-cors";
import { assertSyncToken, getSupabaseAdmin } from "@/lib/supabase-admin";

const passageSchema = z.object({
  id: z.string().min(1),
  occurredAt: z.string().datetime(),
  direction: z.enum(["left_to_right", "right_to_left", "unknown"]).default("unknown"),
  detectionConfidence: z.number().min(0).max(1),
  detectedType: z
    .enum([
      "pleasure_craft",
      "cargo",
      "container",
      "tanker",
      "passenger",
      "tour_boat",
      "tug",
      "ferry",
      "other",
      "unknown",
    ])
    .default("unknown"),
  identificationStatus: z.enum(["identified", "unknown", "ambiguous"]).default("unknown"),
  shipId: z.string().nullable().optional(),
  photoUrl: z.string().url().nullable().optional(),
});

export async function OPTIONS(request: Request) {
  return corsOptions(request);
}

export async function POST(request: Request) {
  if (!assertSyncToken(request)) {
    return corsJson(request, { error: "Invalid sync token" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return corsJson(
      request,
      { error: "Supabase sync is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY." },
      { status: 503 },
    );
  }

  const body = passageSchema.parse(await request.json());

  const { error } = await supabase.from("public_passages").upsert({
    id: body.id,
    occurred_at: body.occurredAt,
    direction: body.direction,
    detection_confidence: body.detectionConfidence,
    detected_type: body.detectedType,
    identification_status: body.identificationStatus,
    ship_id: body.shipId ?? null,
    photo_url: body.photoUrl ?? null,
  });

  if (error) {
    return corsJson(request, { error: error.message }, { status: 500 });
  }

  return corsJson(request, { ok: true });
}
