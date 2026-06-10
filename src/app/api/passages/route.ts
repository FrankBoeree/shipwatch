import { NextResponse } from "next/server";
import { listPassages } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? "30");
  const passages = await listPassages(Number.isFinite(limit) ? limit : 30);

  return NextResponse.json({ passages });
}
