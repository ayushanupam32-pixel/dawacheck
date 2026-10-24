// Stage 1 of the AI core: clean up a strip photo so OCR reads it better.
//
// Pure functions on plain pixel arrays (no canvas, no DOM), so each step is unit-tested in
// tests/preprocess.test.ts and its effect can be measured in the evaluation (with vs without).
// The browser code in lib/ai/ocr.ts only moves pixels between a <canvas> and these functions.
//
// Why no OpenCV.js: it is an 8–10 MB download, too heavy for a ₹10,000 phone on mobile data.
// Everything here is a few dozen lines of arithmetic.

export const TARGET_LONG_SIDE = 1600;

/** Scale so the longer side is ~1600 px: big enough for small print, small enough to be fast. */
export function targetSize(width: number, height: number, longSide = TARGET_LONG_SIDE) {
  const scale = longSide / Math.max(width, height);
  return { width: Math.round(width * scale), height: Math.round(height * scale), scale };
}

/** RGBA bytes (from canvas.getImageData) -> one brightness byte per pixel (ITU-R BT.601). */
export function toGray(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const gray = new Uint8ClampedArray(rgba.length / 4);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
    gray[j] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  }
  return gray;
}

/** The value below which `fraction` of the pixels fall (e.g. 0.02 -> darkest 2%). */
export function percentile(gray: Uint8ClampedArray, fraction: number): number {
  const histogram = new Uint32Array(256);
  for (const v of gray) histogram[v]++;
  const target = fraction * gray.length;
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += histogram[v];
    if (seen >= target) return v;
  }
  return 255;
}

/**
 * Stretch contrast so the darkest 2% become black and the brightest 2% white. Clipping the top
 * 2% also tames foil glare: a few blown-out reflections no longer decide the brightness scale.
 */
export function contrastStretch(gray: Uint8ClampedArray, low = 0.02, high = 0.98) {
  const lo = percentile(gray, low);
  const hi = percentile(gray, high);
  const out = new Uint8ClampedArray(gray.length);
  if (hi - lo < 10) return out.fill(255); // a flat image: nothing to read
  const range = hi - lo;
  for (let i = 0; i < gray.length; i++) out[i] = ((gray[i] - lo) * 255) / range;
  return out;
}

/**
 * Black-and-white with a threshold that adapts to local brightness (Bradley's method).
 * A single global threshold fails on foil, where one half of the strip is in shadow and the other
 * shines. Each pixel is compared with the mean of the `window` × `window` square around it,
 * computed in O(1) per pixel from a summed-area table ("integral image").
 */
export function adaptiveThreshold(
  gray: Uint8ClampedArray,
  width: number,
  height: number,
  window = Math.max(15, Math.round(Math.max(width, height) / 40)) | 1,
  percentDarker = 12,
): Uint8ClampedArray {
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += gray[y * width + x];
      integral[(y + 1) * (width + 1) + (x + 1)] = integral[y * (width + 1) + (x + 1)] + rowSum;
    }
  }
  const half = window >> 1;
  const out = new Uint8ClampedArray(gray.length);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(height - 1, y + half);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(width - 1, x + half);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum =
        integral[(y1 + 1) * (width + 1) + (x1 + 1)] -
        integral[y0 * (width + 1) + (x1 + 1)] -
        integral[(y1 + 1) * (width + 1) + x0] +
        integral[y0 * (width + 1) + x0];
      const i = y * width + x;
      out[i] = gray[i] * area < (sum * (100 - percentDarker)) / 100 ? 0 : 255;
    }
  }
  return out;
}

/** Light text on a dark background (silver foil, coloured boxes) -> dark text on light. */
export function invert(gray: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = 255 - gray[i];
  return out;
}

/**
 * Estimate how far the text is tilted, in degrees (-10..10). For each candidate angle, count the
 * dark pixels on each (rotated) row: when the angle matches the text, rows are either full of
 * ink or empty, so the row counts vary the most. Works on a black-and-white image.
 */
export function estimateSkew(binary: Uint8ClampedArray, width: number, height: number): number {
  const ink: [number, number][] = [];
  // Every row, every 2nd column. Skipping rows would be faster, but a horizontal sampling grid
  // makes every angle look like 0° (aliasing): the tests caught exactly that.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x += 2) if (binary[y * width + x] === 0) ink.push([x, y]);
  }
  if (ink.length < 50) return 0;

  let best = 0;
  let bestScore = -1;
  const diagonal = Math.ceil(Math.hypot(width, height));
  for (let deg = -10; deg <= 10; deg += 0.5) {
    const rad = (deg * Math.PI) / 180;
    const sin = Math.sin(rad);
    const cos = Math.cos(rad);
    const rows = new Float64Array(2 * diagonal);
    for (const [x, y] of ink) rows[Math.round(y * cos - x * sin) + diagonal]++;
    let score = 0;
    for (const r of rows) score += r * r; // sum of squares is highest when rows are "peaky"
    if (score > bestScore) {
      bestScore = score;
      best = deg;
    }
  }
  return best;
}

export type Variant = { name: "enhanced" | "binary" | "inverted"; gray: Uint8ClampedArray };

/**
 * The 3 versions of each photo that OCR reads:
 *  - enhanced: grayscale, contrast stretched (best for matte boxes)
 *  - binary:   adaptive black-and-white (best for uneven light and foil)
 *  - inverted: binary, inverted (light print on dark foil)
 * Stage 2 reads all three and keeps, for each field, the most confident reading.
 */
export function makeVariants(rgba: Uint8ClampedArray, width: number, height: number): Variant[] {
  const enhanced = contrastStretch(toGray(rgba));
  const binary = adaptiveThreshold(enhanced, width, height);
  return [
    { name: "enhanced", gray: enhanced },
    { name: "binary", gray: binary },
    { name: "inverted", gray: invert(binary) },
  ];
}

/** One gray byte per pixel -> RGBA bytes, ready for canvas.putImageData. */
export function grayToRgba(gray: Uint8ClampedArray): Uint8ClampedArray<ArrayBuffer> {
  const rgba = new Uint8ClampedArray(gray.length * 4);
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
    rgba[j] = rgba[j + 1] = rgba[j + 2] = gray[i];
    rgba[j + 3] = 255;
  }
  return rgba;
}
