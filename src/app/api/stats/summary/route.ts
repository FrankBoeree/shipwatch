import { NextResponse } from "next/server";
import { getStatsSummary } from "@/lib/db";

export async function GET() {
  const stats = await getStatsSummary();

  return NextResponse.json({ stats });
}
