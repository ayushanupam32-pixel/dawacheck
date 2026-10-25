import { describe, expect, it } from "vitest";
import type { OcrReading } from "@/lib/ai/merge";
import type { Variant } from "@/lib/ai/preprocess";
import { readProgressively, type Side } from "@/lib/ai/reader";

const variant = (name: string): Variant => ({
  name,
  gray: new Uint8ClampedArray(4).fill(255),
  width: 2,
  height: 2,
});
const VARIANTS = ["enhanced", "binary", "inverted", "ink"].map(variant);

/** A fake OCR that finishes reads in a scrambled order, like 2 workers racing each other. */
function side(prefix: string, delays: Record<string, number>, started: string[]): Side {
  return {
    variants: VARIANTS,
    recognize: (v) => {
      started.push(`${prefix}:${v.name}`);
      return new Promise<OcrReading>((resolve) =>
        setTimeout(
          () => resolve({ variant: `${prefix}:${v.name}`, text: "", confidence: 50, lines: [] }),
          delays[v.name] ?? 0,
        ),
      );
    },
  };
}

describe("readProgressively", () => {
  it("starts a pass's reads together but keeps the results in a fixed order", async () => {
    const started: string[] = [];
    // Nothing is read from empty text, so pass 2 runs. The slowest variant is asked first.
    const delays = { binary: 5, ink: 30, enhanced: 1, inverted: 10 };
    const result = await readProgressively(side("front", delays, started), [
      side("back", { ...delays, ink: 1, inverted: 40 }, started),
    ]);
    expect(result.front.map((r) => r.variant)).toEqual([
      "front:binary",
      "front:ink",
      "front:enhanced",
      "front:inverted",
    ]);
    // The last back photo is also turned sideways (pass 3) because no stamp field was found.
    expect(result.back.map((r) => r.variant)).toEqual([
      "back:binary",
      "back:ink",
      "back:enhanced",
      "back:inverted",
      "back:ink-r90",
      "back:ink-r270",
    ]);
    // Pass 2 started all 6 reads before any of them finished.
    expect(started.slice(2, 8)).toEqual([
      "front:ink",
      "front:enhanced",
      "front:inverted",
      "back:ink",
      "back:enhanced",
      "back:inverted",
    ]);
  });

  it("reads only the unprocessed photo for the baseline", async () => {
    const started: string[] = [];
    const result = await readProgressively(side("front", {}, started), null, {
      preprocess: false,
    });
    expect(result.front.map((r) => r.variant)).toEqual(["front:enhanced"]);
    expect(started).toEqual(["front:enhanced"]);
  });
});
