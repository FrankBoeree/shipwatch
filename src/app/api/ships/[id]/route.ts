import { NextResponse } from "next/server";
import { getShip, listPassages } from "@/lib/db";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const ship = await getShip(id);

  if (!ship) {
    return NextResponse.json({ error: "Ship not found" }, { status: 404 });
  }

  const passages = (await listPassages(100)).filter((passage) => passage.shipId === id);

  return NextResponse.json({ ship, passages });
}
