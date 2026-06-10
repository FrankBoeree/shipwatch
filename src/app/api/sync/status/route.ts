import { corsJson, corsOptions } from "@/lib/sync-cors";

export async function OPTIONS(request: Request) {
  return corsOptions(request);
}

export async function GET(request: Request) {
  return corsJson(request, {
    configured: Boolean(
      process.env.SUPABASE_URL &&
        process.env.SUPABASE_SERVICE_ROLE_KEY &&
        process.env.SYNC_SHARED_SECRET,
    ),
    hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
    hasSupabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    hasSyncSharedSecret: Boolean(process.env.SYNC_SHARED_SECRET),
  });
}
