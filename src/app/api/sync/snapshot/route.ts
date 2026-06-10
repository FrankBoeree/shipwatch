import { corsJson, corsOptions } from "@/lib/sync-cors";
import { assertSyncToken, getSupabaseAdmin } from "@/lib/supabase-admin";

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

  const formData = await request.formData();
  const file = formData.get("snapshot");

  if (!(file instanceof File)) {
    return corsJson(request, { error: "Missing snapshot file" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const storagePath = "live/latest.jpg";
  const { error: uploadError } = await supabase.storage
    .from("live-snapshots")
    .upload(storagePath, bytes, {
      contentType: file.type || "image/jpeg",
      upsert: true,
    });

  if (uploadError) {
    return corsJson(request, { error: uploadError.message }, { status: 500 });
  }

  const { data } = supabase.storage.from("live-snapshots").getPublicUrl(storagePath);
  const latestSnapshotUrl = data.publicUrl;
  const now = new Date().toISOString();
  const { error: statusError } = await supabase.from("public_runtime_status").upsert({
    id: "public",
    latest_snapshot_url: latestSnapshotUrl,
    latest_snapshot_updated_at: now,
    last_sync_at: now,
  });

  if (statusError) {
    return corsJson(request, { error: statusError.message }, { status: 500 });
  }

  return corsJson(request, { ok: true, latestSnapshotUrl });
}
