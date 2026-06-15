import { cloudinaryCutout, isCloudinaryConfigured } from "./ramp-cloudinary.js";

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
 * Local (in-process) background removal via @imgly. Loaded LAZILY on purpose:
 * @imgly bundles its own sharp/libvips, and merely importing it at module load
 * pulls a SECOND libvips into the process alongside the root `sharp`, which
 * crashes compositing. Importing it dynamically — only when we actually need the
 * local fallback — avoids that duplicate-libvips load entirely.
 */
async function cutoutWithImgly(input: Buffer): Promise<Buffer> {
  const { removeBackground } = await import("@imgly/background-removal-node");
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

/**
 * Subject cutout — removes the background from a captured/uploaded photo so the
 * REAL person pixels (face + body, 100% intact) can be composited onto a poster.
 *
 * Strategy: prefer Cloudinary background removal (no native deps, no libvips
 * conflict). Only if Cloudinary is unavailable/fails do we fall back to the
 * local @imgly path (lazy-loaded). On total failure it throws so the caller can
 * fall back to the raw photo.
 */
export async function cutoutSubject(input: Buffer): Promise<Buffer> {
  if (isCloudinaryConfigured()) {
    try {
      return await cloudinaryCutout(input);
    } catch (e) {
      console.warn(
        "[ramp:bg-removal] Cloudinary cutout failed — trying local @imgly:",
        e instanceof Error ? e.message : e,
      );
    }
  }
  return cutoutWithImgly(input);
}
