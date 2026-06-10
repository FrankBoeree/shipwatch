import { NextResponse } from "next/server";
import { getPassage } from "@/lib/db";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const passage = await getPassage(id);

  if (!passage) {
    return NextResponse.json({ error: "Passage not found" }, { status: 404 });
  }

  return NextResponse.json({ passage });
}
