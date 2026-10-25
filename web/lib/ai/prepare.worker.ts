// Web Worker: prepares photos (lib/ai/prepare.ts) off the page's main thread, so buttons and the
// progress message keep responding while the pixels are crunched. Started by lib/ai/ocr.ts.
// The photo stays on the device: a worker is just another thread of this same web page.

import { preparePhoto } from "./prepare";

type Request = { id: number; photo: Blob };

self.onmessage = async ({ data }: MessageEvent<Request>) => {
  try {
    const prepared = await preparePhoto(data.photo, (w, h) => new OffscreenCanvas(w, h));
    // "Transfer" the pixel buffers instead of copying them: the page receives the same memory.
    const transfer = prepared.variants.map((v) => v.gray.buffer as ArrayBuffer);
    self.postMessage({ id: data.id, prepared }, { transfer });
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error) });
  }
};
