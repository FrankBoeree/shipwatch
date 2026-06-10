import { NextResponse } from "next/server";
import { listPassages } from "@/lib/db";

export async function GET() {
  const passages = await listPassages(50);

  return NextResponse.json({ passages });
}
