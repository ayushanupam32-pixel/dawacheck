import { describe, expect, it } from "vitest";
import {
  applyOrientation,
  jpegOrientation,
  resizeRgba,
  rotateRgba,
  type Rgba,
} from "@/lib/ai/image";

/** A 4×2 image whose red channel numbers the pixels 0..7, so we can see where each one goes. */
function numbered(): Rgba {
  const data = new Uint8ClampedArray(4 * 2 * 4);
  for (let i = 0; i < 8; i++) data.set([i, 0, 0, 255], i * 4);
  return { data, width: 4, height: 2 };
}
const reds = (img: Rgba) => [...img.data].filter((_, i) => i % 4 === 0);

describe("resizeRgba", () => {
  it("halves and doubles the size", () => {
    expect(resizeRgba(numbered(), 2, 1)).toMatchObject({ width: 2, height: 1 });
    expect(resizeRgba(numbered(), 8, 4).data.length).toBe(8 * 4 * 4);
  });

  it("keeps a flat colour flat", () => {
    const flat = { data: new Uint8ClampedArray(16 * 4).fill(200), width: 4, height: 4 };
    expect(new Set(resizeRgba(flat, 7, 3).data)).toEqual(new Set([200]));
  });
});

describe("rotateRgba", () => {
  it("0° changes nothing", () => {
    expect(reds(rotateRgba(numbered(), 0))).toEqual(reds(numbered()));
  });

  it("180° reverses the pixel order", () => {
    expect(reds(rotateRgba(numbered(), 180))).toEqual([7, 6, 5, 4, 3, 2, 1, 0]);
  });
});

describe("applyOrientation (EXIF)", () => {
  it("6 = turn 90° clockwise: the left column becomes the top row", () => {
    const out = applyOrientation(numbered(), 6);
    expect([out.width, out.height]).toEqual([2, 4]);
    // Input rows: [0 1 2 3] / [4 5 6 7]. Turned clockwise, the first row reads 4, 0.
    expect(reds(out)).toEqual([4, 0, 5, 1, 6, 2, 7, 3]);
  });

  it("8 = turn 90° anticlockwise", () => {
    expect(reds(applyOrientation(numbered(), 8))).toEqual([3, 7, 2, 6, 1, 5, 0, 4]);
  });

  it("3 = turn 180°", () => {
    expect(reds(applyOrientation(numbered(), 3))).toEqual([7, 6, 5, 4, 3, 2, 1, 0]);
  });

  it("1 = upright, unchanged", () => {
    expect(applyOrientation(numbered(), 1)).toEqual(numbered());
  });
});

describe("jpegOrientation", () => {
  it("reads the Orientation tag from a minimal EXIF header", () => {
    // SOI, APP1 "Exif\0\0", big-endian TIFF header, 1 IFD entry: tag 0x0112 = 6.
    const bytes = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x4d, 0x4d, 0x00,
      0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01,
      0x00, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xda,
    ]);
    expect(jpegOrientation(bytes)).toBe(6);
  });

  it("returns 1 for a file without EXIF or a non-JPEG", () => {
    expect(jpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 0]))).toBe(1);
    expect(jpegOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(1);
  });
});
