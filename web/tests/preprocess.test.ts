import { describe, expect, it } from "vitest";
import {
  adaptiveThreshold,
  contrastStretch,
  estimateSkew,
  grayToRgba,
  invert,
  makeVariants,
  percentile,
  targetSize,
  toGray,
} from "@/lib/ai/preprocess";

const W = 120;
const H = 60;

/** A white image with dark horizontal "text lines", optionally tilted by `deg` degrees. */
function linesImage(deg = 0, ink = 30, paper = 220): Uint8ClampedArray {
  const img = new Uint8ClampedArray(W * H).fill(paper);
  const tan = Math.tan((deg * Math.PI) / 180);
  for (let x = 10; x < W - 10; x++) {
    for (const base of [15, 30, 45]) {
      const y = Math.round(base + (x - W / 2) * tan);
      for (const dy of [0, 1, 2]) if (y + dy >= 0 && y + dy < H) img[(y + dy) * W + x] = ink;
    }
  }
  return img;
}

describe("targetSize", () => {
  it("scales the longer side to 1600 px", () => {
    expect(targetSize(4000, 3000)).toMatchObject({ width: 1600, height: 1200 });
    expect(targetSize(800, 1200)).toMatchObject({ width: 1067, height: 1600 });
  });
});

describe("toGray", () => {
  it("weights green most, blue least", () => {
    const g = toGray(new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]));
    expect([...g]).toEqual([76, 150, 29]);
  });
});

describe("contrastStretch", () => {
  it("maps a dull image to the full 0–255 range", () => {
    const dull = linesImage(0, 100, 140); // low contrast: ink 100, paper 140
    const out = contrastStretch(dull);
    expect(Math.min(...out)).toBe(0);
    expect(Math.max(...out)).toBe(255);
  });

  it("is not thrown off by a few glare pixels", () => {
    const img = linesImage(0, 100, 140);
    for (let i = 0; i < 20; i++) img[i] = 255; // 0.3% blown-out glare
    expect(percentile(contrastStretch(img), 0.5)).toBe(255); // paper still maps to white
  });
});

describe("adaptiveThreshold", () => {
  it("separates text from paper even when half the image is in shadow", () => {
    const img = linesImage();
    for (let y = 0; y < H; y++) for (let x = 0; x < W / 2; x++) img[y * W + x] -= 90; // shadow
    const bw = adaptiveThreshold(img, W, H, 15);
    // An ink pixel in the shadow is black; a paper pixel in the shadow is white.
    expect(bw[15 * W + 20]).toBe(0);
    expect(bw[22 * W + 20]).toBe(255);
    // Same in the bright half.
    expect(bw[15 * W + 90]).toBe(0);
    expect(bw[22 * W + 90]).toBe(255);
  });
});

describe("invert", () => {
  it("swaps black and white", () => {
    expect([...invert(new Uint8ClampedArray([0, 255, 100]))]).toEqual([255, 0, 155]);
  });
});

describe("estimateSkew", () => {
  it.each([0, 4, -6])("finds a %i° tilt within 1°", (deg) => {
    const bw = adaptiveThreshold(linesImage(deg), W, H, 15);
    expect(Math.abs(estimateSkew(bw, W, H) - deg)).toBeLessThanOrEqual(1);
  });

  it("returns 0 for a blank image", () => {
    expect(estimateSkew(new Uint8ClampedArray(W * H).fill(255), W, H)).toBe(0);
  });
});

describe("makeVariants", () => {
  it("makes enhanced, binary and inverted versions of the same size", () => {
    const rgba = grayToRgba(linesImage());
    const variants = makeVariants(rgba, W, H);
    expect(variants.map((v) => v.name)).toEqual(["enhanced", "binary", "inverted"]);
    for (const v of variants) expect(v.gray.length).toBe(W * H);
  });
});
