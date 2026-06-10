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
  const passageId = String(formData.get("passageId") ?? "").trim();
  const file = formData.get("photo");

  if (!passageId) {
    return corsJson(request, { error: "Missing passageId" }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return corsJson(request, { error: "Missing photo file" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const storagePath = `${passageId}.jpg`;
  const { error: uploadError } = await supabase.storage.from("passage-photos").upload(storagePath, bytes, {
    contentType: file.type || "image/jpeg",
    upsert: true,
  });

  if (uploadError) {
    return corsJson(request, { error: uploadError.message }, { status: 500 });
  }

  const { data } = supabase.storage.from("passage-photos").getPublicUrl(storagePath);
  const photoUrl = data.publicUrl;

  const { error: updateError } = await supabase
    .from("public_passages")
    .update({ photo_url: photoUrl })
    .eq("id", passageId);

  if (updateError) {
    return corsJson(request, { error: updateError.message }, { status: 500 });
  }

  return corsJson(request, { ok: true, photoUrl });
}
