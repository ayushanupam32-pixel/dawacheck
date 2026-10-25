// Plain-JavaScript image operations for the evaluation script (scripts/eval.ts), which runs in
// Node where there is no <canvas>. In the browser, lib/ai/prepare.ts uses canvas for the same steps.
// RGBA pixel arrays: 4 bytes per pixel, row by row.

export type Rgba = { data: Uint8ClampedArray; width: number; height: number };

/** Bilinear resize (each output pixel blends the 4 nearest input pixels). */
export function resizeRgba(src: Rgba, width: number, height: number): Rgba {
  const out = new Uint8ClampedArray(width * height * 4);
  const sx = src.width / width;
  const sy = src.height / height;
  for (let y = 0; y < height; y++) {
    const fy = Math.min(src.height - 1, (y + 0.5) * sy - 0.5);
    const y0 = Math.max(0, Math.floor(fy));
    const y1 = Math.min(src.height - 1, y0 + 1);
    const wy = Math.max(0, fy - y0);
    for (let x = 0; x < width; x++) {
      const fx = Math.min(src.width - 1, (x + 0.5) * sx - 0.5);
      const x0 = Math.max(0, Math.floor(fx));
      const x1 = Math.min(src.width - 1, x0 + 1);
      const wx = Math.max(0, fx - x0);
      for (let c = 0; c < 4; c++) {
        const a = src.data[(y0 * src.width + x0) * 4 + c];
        const b = src.data[(y0 * src.width + x1) * 4 + c];
        const d = src.data[(y1 * src.width + x0) * 4 + c];
        const e = src.data[(y1 * src.width + x1) * 4 + c];
        out[(y * width + x) * 4 + c] =
          (a * (1 - wx) + b * wx) * (1 - wy) + (d * (1 - wx) + e * wx) * wy;
      }
    }
  }
  return { data: out, width, height };
}

/** Rotate by `degrees` around the centre, same size, white where the corners move in. */
export function rotateRgba(src: Rgba, degrees: number): Rgba {
  const { width, height } = src;
  const out = new Uint8ClampedArray(src.data.length).fill(255);
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Pixel centres are at 0..width-1, so the image's middle is (width - 1) / 2.
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // For each output pixel, look up where it came from (inverse rotation).
      const dx = x - cx;
      const dy = y - cy;
      const sxp = Math.round(cx + dx * cos + dy * sin);
      const syp = Math.round(cy - dx * sin + dy * cos);
      if (sxp < 0 || syp < 0 || sxp >= width || syp >= height) continue;
      const from = (syp * width + sxp) * 4;
      const to = (y * width + x) * 4;
      out[to] = src.data[from];
      out[to + 1] = src.data[from + 1];
      out[to + 2] = src.data[from + 2];
      out[to + 3] = 255;
    }
  }
  return { data: out, width, height };
}

/**
 * Phones often save a photo sideways plus an EXIF "orientation" tag saying how to turn it.
 * Returns that tag (1 = upright, 3 = 180°, 6 = 90° clockwise, 8 = 90° anticlockwise), or 1.
 */
export function jpegOrientation(bytes: Uint8Array): number {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1; // not a JPEG
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) return 1;
    const marker = bytes[offset + 1];
    const size = (bytes[offset + 2] << 8) | bytes[offset + 3];
    // APP1 segment holding "Exif\0\0" then a TIFF header.
    if (marker === 0xe1 && String.fromCharCode(...bytes.slice(offset + 4, offset + 8)) === "Exif") {
      const tiff = offset + 10;
      const little = bytes[tiff] === 0x49; // "II" = little-endian, "MM" = big-endian
      const u16 = (p: number) =>
        little ? bytes[p] | (bytes[p + 1] << 8) : (bytes[p] << 8) | bytes[p + 1];
      const u32 = (p: number) =>
        little
          ? (bytes[p] | (bytes[p + 1] << 8) | (bytes[p + 2] << 16) | (bytes[p + 3] << 24)) >>> 0
          : ((bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3]) >>> 0;
      const ifd = tiff + u32(tiff + 4);
      const entries = u16(ifd);
      for (let i = 0; i < entries; i++) {
        const entry = ifd + 2 + i * 12;
        if (u16(entry) === 0x0112) return u16(entry + 8); // the Orientation tag
      }
      return 1;
    }
    if (marker === 0xda) return 1; // image data starts: no EXIF found
    offset += 2 + size;
  }
  return 1;
}

/** Turn the pixels so the photo is upright, according to the EXIF orientation tag. */
export function applyOrientation(src: Rgba, orientation: number): Rgba {
  if (orientation !== 3 && orientation !== 6 && orientation !== 8) return src;
  const { width, height } = src;
  const turned = orientation !== 3;
  const out = new Uint8ClampedArray(src.data.length);
  const outWidth = turned ? height : width;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let nx: number;
      let ny: number;
      if (orientation === 3) [nx, ny] = [width - 1 - x, height - 1 - y];
      else if (orientation === 6) [nx, ny] = [height - 1 - y, x];
      else [nx, ny] = [y, width - 1 - x];
      const from = (y * width + x) * 4;
      const to = (ny * outWidth + nx) * 4;
      for (let c = 0; c < 4; c++) out[to + c] = src.data[from + c];
    }
  }
  return { data: out, width: outWidth, height: turned ? width : height };
}
