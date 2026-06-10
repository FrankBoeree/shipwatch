import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export async function GET(_request: Request, context: { params: Promise<{ name: string }> }) {
  const { name } = await context.params;
  const safeName = path.basename(name);
  const photoPath = path.join(process.cwd(), "data", "photos", safeName);

  try {
    const file = await readFile(photoPath);

    return new NextResponse(file, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }
}
