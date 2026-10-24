// Serves one photo from eval/photos to the labeling tool. DEVELOPMENT ONLY (404 in production).

import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { NextResponse, type NextRequest } from "next/server";

const PHOTOS = resolve(process.cwd(), "..", "eval", "photos");

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // basename() stops "../" tricks: only files directly inside eval/photos can be read.
  const name = basename(request.nextUrl.searchParams.get("name") ?? "");
  const path = join(PHOTOS, name);
  if (!name || !/\.(jpe?g|png)$/i.test(name) || !existsSync(path)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const type = name.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  return new NextResponse(readFileSync(path), { headers: { "Content-Type": type } });
}
