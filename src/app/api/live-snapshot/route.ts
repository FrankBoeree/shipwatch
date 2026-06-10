import { NextResponse } from "next/server";
import { getLiveSnapshot } from "@/lib/db";

export async function GET() {
  const snapshot = await getLiveSnapshot();

  return NextResponse.json({ snapshot });
}
