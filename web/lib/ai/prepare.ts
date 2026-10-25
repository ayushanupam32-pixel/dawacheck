// Load a photo and make the OCR variants (Stage 1), using a canvas for decoding, scaling and
// rotating. The same code runs in two places:
//   - in a Web Worker (lib/ai/prepare.worker.ts) with an OffscreenCanvas, so the page stays
//     responsive while a ₹10,000 phone crunches ~2 million pixels per photo;
//   - on the page itself with a normal <canvas>, on old browsers that have no OffscreenCanvas.
// The pixel maths is in preprocess.ts (pure, tested); this file only moves pixels around.

import { estimateSkew, makeVariants, targetSize, type Variant } from "./preprocess";

export type Prepared = { width: number; height: number; variants: Variant[]; skew: number };

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const context = (canvas: AnyCanvas) =>
  canvas.getContext("2d", { willReadFrequently: true }) as Context2D;

/**
 * Scale the photo to ~1600 px, straighten it if the text is tilted, and make the variants.
 * `imageOrientation: "from-image"` honours the phone's rotation flag (EXIF).
 */
export async function preparePhoto(
  photo: Blob,
  makeCanvas: (width: number, height: number) => AnyCanvas,
): Promise<Prepared> {
  const bitmap = await createImageBitmap(photo, { imageOrientation: "from-image" });
  const { width, height } = targetSize(bitmap.width, bitmap.height);
  const canvas = makeCanvas(width, height);
  const ctx = context(canvas);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let variants = makeVariants(ctx.getImageData(0, 0, width, height).data, width, height);
  const skew = estimateSkew(variants[1].gray, width, height);
  if (Math.abs(skew) >= 1) {
    // Rotate the original photo the other way, on a white background, then redo the variants.
    const sctx = context(makeCanvas(width, height));
    sctx.fillStyle = "#fff";
    sctx.fillRect(0, 0, width, height);
    sctx.translate(width / 2, height / 2);
    sctx.rotate((-skew * Math.PI) / 180);
    sctx.drawImage(canvas, -width / 2, -height / 2);
    variants = makeVariants(sctx.getImageData(0, 0, width, height).data, width, height);
  }
  return { width, height, variants, skew };
}
