// Labeling tool backend: lists the photos in eval/photos and saves eval/labels.json.
// DEVELOPMENT ONLY: on the live site (production) every request gets 404, and the photos are
// never deployed (eval/photos is git-ignored).

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import type { Label } from "@/lib/ai/score";

const EVAL_DIR = resolve(process.cwd(), "..", "eval");
const PHOTOS = join(EVAL_DIR, "photos");
const LABELS = join(EVAL_DIR, "labels.json");

const devOnly = () =>
  process.env.NODE_ENV === "production"
    ? NextResponse.json({ error: "Not found" }, { status: 404 })
    : null;

function readLabels(): Label[] {
  return existsSync(LABELS) ? (JSON.parse(readFileSync(LABELS, "utf8")) as Label[]) : [];
}

/**
 * Photos are named <id>-front.jpg and <id>-back.jpg (jpg, jpeg or png).
 * Returns one entry per id, with its saved label if there is one.
 */
export async function GET() {
  const blocked = devOnly();
  if (blocked) return blocked;
  const files = existsSync(PHOTOS)
    ? readdirSync(PHOTOS).filter((f) => /\.(jpe?g|png)$/i.test(f))
    : [];
  const byId = new Map<string, { front?: string; back?: string }>();
  for (const file of files) {
    const m = /^(.+)-(front|back)\.(jpe?g|png)$/i.exec(file);
    if (!m) continue;
    const entry = byId.get(m[1]) ?? {};
    entry[m[2].toLowerCase() as "front" | "back"] = file;
    byId.set(m[1], entry);
  }
  const labels = readLabels();
  const photos = [...byId.entries()]
    .filter(([, e]) => e.front)
    .map(([id, e]) => ({
      id,
      front: e.front!,
      back: e.back ?? null,
      label: labels.find((l) => l.id === id) ?? null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const unpaired = files.filter((f) => !/^(.+)-(front|back)\.(jpe?g|png)$/i.test(f));
  return NextResponse.json({ photos, unpaired });
}

/**
 * Freeze ~1 in 4 strips as the final TEST set, decided once from the id (a simple string hash),
 * so the same photo always lands in the same split and test photos are never used for tuning.
 */
function splitFor(id: string): "dev" | "test" {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % 4 === 0 ? "test" : "dev";
}

export async function POST(request: NextRequest) {
  const blocked = devOnly();
  if (blocked) return blocked;
  const label = (await request.json()) as Label;
  if (!label.id || !label.front) {
    return NextResponse.json({ error: "id and front are required" }, { status: 400 });
  }
  const labels = readLabels();
  const existing = labels.find((l) => l.id === label.id);
  // The split is decided the first time and never changes afterwards.
  const saved: Label = { ...label, split: existing?.split ?? splitFor(label.id) };
  const next = existing ? labels.map((l) => (l.id === label.id ? saved : l)) : [...labels, saved];
  writeFileSync(LABELS, JSON.stringify(next, null, 1) + "\n");
  return NextResponse.json({ saved });
}
