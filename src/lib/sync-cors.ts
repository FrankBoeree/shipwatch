import { NextResponse } from "next/server";

const defaultAllowedOrigins = ["http://localhost:3003", "https://shipwatch.netlify.app"];

function allowedOrigins() {
  return (process.env.SYNC_ALLOWED_ORIGINS?.split(",") ?? defaultAllowedOrigins)
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function corsHeaders(request: Request) {
  const origin = request.headers.get("origin");
  const allowedOrigin = origin && allowedOrigins().includes(origin) ? origin : allowedOrigins()[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, x-sync-token",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function corsOptions(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}

export function corsJson(request: Request, body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...corsHeaders(request),
      ...init?.headers,
    },
  });
}
