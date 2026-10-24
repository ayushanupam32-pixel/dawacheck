import { describe, expect, it } from "vitest";
import {
  adaptiveThreshold,
  contrastStretch,
  estimateSkew,
  grayToRgba,
  inkness,
  invert,
  makeVariants,
  percentile,
  rotateQuarter,
  straighten,
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
  it("makes enhanced, binary, inverted and ink versions of the same size", () => {
    const rgba = grayToRgba(linesImage());
    const variants = makeVariants(rgba, W, H);
    expect(variants.map((v) => v.name)).toEqual(["enhanced", "binary", "inverted", "ink"]);
    for (const v of variants) {
      expect(v.gray.length).toBe(W * H);
      expect([v.width, v.height]).toEqual([W, H]);
    }
  });
});

describe("inkness", () => {
  it("keeps coloured ink dark and turns grey foil white, however bright the foil is", () => {
    const purpleInk = [110, 60, 180, 255];
    const darkFoil = [70, 70, 72, 255];
    const shinyFoil = [235, 236, 238, 255];
    const out = inkness(new Uint8ClampedArray([...purpleInk, ...darkFoil, ...shinyFoil]));
    expect(out[0]).toBeLessThan(150); // ink stands out
    expect(out[1]).toBeGreaterThan(250); // dark foil -> white
    expect(out[2]).toBeGreaterThan(250); // shiny foil -> white
  });
});

describe("rotateQuarter", () => {
  // 3 wide x 2 tall, pixels numbered 0..5: [0 1 2] / [3 4 5]
  const v = { name: "ink", gray: new Uint8ClampedArray([0, 1, 2, 3, 4, 5]), width: 3, height: 2 };

  it("90° clockwise swaps width and height and moves the left column to the top", () => {
    const r = rotateQuarter(v, true);
    expect([r.width, r.height, r.name]).toEqual([2, 3, "ink-r90"]);
    expect([...r.gray]).toEqual([3, 0, 4, 1, 5, 2]);
  });

  it("a turn each way gets back the original", () => {
    expect([...rotateQuarter(rotateQuarter(v, true), false).gray]).toEqual([...v.gray]);
  });
});

describe("straighten", () => {
  it("fixes a 12° tilt that remains after a quarter turn", () => {
    const tilted = { name: "ink", gray: linesImage(12), width: W, height: H };
    const fixed = straighten(tilted);
    const bw = adaptiveThreshold(fixed.gray, W, H, 15);
    expect(Math.abs(estimateSkew(bw, W, H))).toBeLessThanOrEqual(1);
  });
});
