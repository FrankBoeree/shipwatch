import { createClient } from "@supabase/supabase-js";

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function assertSyncToken(request: Request) {
  const expected = process.env.SYNC_SHARED_SECRET;

  if (!expected) {
    return process.env.NODE_ENV !== "production";
  }

  return request.headers.get("x-sync-token") === expected;
}
