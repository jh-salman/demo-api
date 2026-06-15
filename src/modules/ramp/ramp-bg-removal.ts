import { removeBackground } from "@imgly/background-removal-node";

/** Sniff a usable image mime from magic bytes (imgly needs a typed source). */
function detectMime(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return "image/jpeg";
}

/**
 * Subject cutout — removes the background from a captured/uploaded photo so the
 * REAL person pixels (face + body, 100% intact) can be composited onto a poster.
 *
 * This is the deterministic, face-safe path: no AI redraw of the person, only a
 * segmentation mask applied to the original bytes. Returns a transparent PNG.
 * On any failure it throws so the caller can fall back to the raw photo.
 */
export async function cutoutSubject(input: Buffer): Promise<Buffer> {
  const mime = detectMime(input);
  // imgly's node decoder requires a typed source; a bare Buffer is rejected as
  // "Unsupported format". Wrap it in a Blob with an explicit mime type.
  const source = new Blob([new Uint8Array(input)], { type: mime });

  const blob = await removeBackground(source, {
    output: { format: "image/png", quality: 0.9 },
  });
  const ab = await blob.arrayBuffer();
  const out = Buffer.from(ab);
  if (out.length < 32) {
    throw new Error("Background removal returned empty image");
  }
  return out;
}
