"use client";

/*
 * Bringing in a graphic made elsewhere (Canva and so on). The picture is checked,
 * turned the right way up, fitted to the chosen size and re-saved as a JPEG small
 * enough to store, so it behaves like one made here.
 */

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MIN_SIDE = 300;
/** The server refuses data URLs over 1.5 MB; stay well under. */
const MAX_OUTPUT_CHARS = 1_300_000;

export type FitMode = "fit" | "fill";

export class UploadError extends Error {}

/** Decode the file, or say plainly why not. */
export async function openPicture(file: File): Promise<ImageBitmap> {
  if (!file.type.startsWith("image/")) throw new UploadError("That isn't a picture. Export it from Canva as PNG or JPG.");
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError("That file is over 20 MB. Export a smaller PNG or JPG.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new UploadError("Couldn't open that picture. Save or export it as a PNG or JPG and try again.");
  }
  if (Math.min(bitmap.width, bitmap.height) < MIN_SIDE) {
    bitmap.close();
    throw new UploadError(`That picture is too small (${bitmap.width}×${bitmap.height}). It should be at least ${MIN_SIDE}px on each side.`);
  }
  return bitmap;
}

/** How far the picture's shape is from the target's, as a fraction (0 = same shape). */
export const shapeGap = (bitmap: ImageBitmap, w: number, h: number) => Math.abs(bitmap.width / bitmap.height / (w / h) - 1);

/**
 * Draw the picture onto a w×h canvas: "fit" shows all of it with bars in `bg`,
 * "fill" covers the canvas and crops the edges. Transparent areas become `bg`.
 */
export function composePicture(bitmap: ImageBitmap, w: number, h: number, mode: FitMode, bg: string): string {
  const out = (scale: number) => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new UploadError("This browser can't prepare the picture.");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const k = (mode === "fit" ? Math.min : Math.max)(canvas.width / bitmap.width, canvas.height / bitmap.height);
    const dw = bitmap.width * k;
    const dh = bitmap.height * k;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
    return canvas;
  };
  // Shrink quality, then size, until it fits what the server accepts.
  for (const scale of [1, 0.8, 0.6]) {
    const canvas = out(scale);
    for (const q of [0.92, 0.85, 0.75, 0.65]) {
      const url = canvas.toDataURL("image/jpeg", q);
      if (url.length <= MAX_OUTPUT_CHARS) return url;
    }
  }
  throw new UploadError("Couldn't make that picture small enough. Try exporting a smaller one.");
}
