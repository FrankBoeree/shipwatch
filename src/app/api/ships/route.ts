import { NextResponse } from "next/server";
import { listShips } from "@/lib/db";

export async function GET() {
  const ships = await listShips();

  return NextResponse.json({ ships });
}
