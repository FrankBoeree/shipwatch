import { NextResponse } from "next/server";
import { z } from "zod";
import { getPassagesOverTime } from "@/lib/db";
import type { TimeGranularity } from "@/lib/types";

const granularitySchema = z.enum(["day", "week", "month"]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = granularitySchema.safeParse(searchParams.get("granularity") ?? "day");

  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldige granulariteit" }, { status: 400 });
  }

  const buckets = await getPassagesOverTime(parsed.data as TimeGranularity);

  return NextResponse.json({ buckets });
}
