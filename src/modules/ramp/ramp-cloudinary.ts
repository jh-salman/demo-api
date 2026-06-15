import { randomUUID } from "node:crypto";

/**
 * Cloudinary-native image ops for the RAMP hybrid pipeline.
 *
 * Replaces the in-process sharp + @imgly background removal (which crashes from a
 * duplicate libvips load) with Cloudinary transformations:
 *   • subject cutout      → e_background_removal
 *   • real-face crop      → c_thumb,g_face
 *   • real-face re-paste  → face-gravity overlay (region-relative) + feather
 *
 * Every helper throws on failure so callers can fall back to the previous path.
 */

type CloudinaryModule = typeof import("cloudinary").v2;

let configured: CloudinaryModule | null = null;

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME?.trim() &&
      process.env.CLOUDINARY_API_KEY?.trim() &&
      process.env.CLOUDINARY_API_SECRET?.trim(),
  );
}

async function getCloudinary(): Promise<CloudinaryModule> {
  if (configured) return configured;
  if (!isCloudinaryConfigured()) {
    throw new Error("Cloudinary is not configured (CLOUDINARY_* env vars missing)");
  }
  const { v2: cld } = await import("cloudinary");
  cld.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME!.trim(),
    api_key: process.env.CLOUDINARY_API_KEY!.trim(),
    api_secret: process.env.CLOUDINARY_API_SECRET!.trim(),
    secure: true,
  });
  configured = cld;
  return cld;
}

async function uploadBuffer(
  buffer: Buffer,
  folder: string,
): Promise<{ publicId: string; url: string }> {
  const cld = await getCloudinary();
  return new Promise((resolve, reject) => {
    const stream = cld.uploader.upload_stream(
      {
        folder,
        public_id: randomUUID(),
        resource_type: "image",
        overwrite: false,
      },
      (err, result) => {
        if (err) reject(err);
        else if (!result?.public_id || !result?.secure_url) {
          reject(new Error("Cloudinary upload failed"));
        } else {
          resolve({ publicId: result.public_id, url: result.secure_url });
        }
      },
    );
    stream.end(buffer);
  });
}

/**
 * Fetch a derived (transformed) asset as a Buffer. Add-on transformations like
 * background removal process asynchronously — Cloudinary returns 423 (Locked)
 * while the derivation is being generated, so we retry with backoff.
 */
async function fetchDerived(url: string, label: string): Promise<Buffer> {
  const maxAttempts = 6;
  let lastStatus = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url);
    if (res.ok) {
      const ab = await res.arrayBuffer();
      const buf = Buffer.from(ab);
      if (buf.length < 64) throw new Error(`${label}: derived asset was empty`);
      return buf;
    }
    lastStatus = res.status;
    // 423 = still processing, 420/429 = rate limit → wait and retry.
    if (res.status === 423 || res.status === 420 || res.status === 429) {
      await new Promise((r) => setTimeout(r, 1200 * attempt));
      continue;
    }
    throw new Error(`${label}: Cloudinary returned ${res.status}`);
  }
  throw new Error(`${label}: timed out after retries (last status ${lastStatus})`);
}

/**
 * Remove the background from a captured photo → transparent PNG of the subject.
 * Requires the Cloudinary AI Background Removal add-on to be enabled.
 */
export async function cloudinaryCutout(input: Buffer): Promise<Buffer> {
  const cld = await getCloudinary();
  const { publicId } = await uploadBuffer(input, "salonx/ramp/work/src");
  const url = cld.url(publicId, {
    resource_type: "image",
    secure: true,
    transformation: [{ effect: "background_removal" }, { fetch_format: "png" }],
  });
  return fetchDerived(url, "cutout");
}

/**
 * Crop a head-and-shoulders region centered on the detected face, as PNG.
 * Used as the real-face layer that gets re-pasted over the AI poster.
 */
export async function cloudinaryFaceCrop(
  input: Buffer,
  opts?: { width?: number; height?: number; zoom?: number },
): Promise<{ buffer: Buffer; publicId: string }> {
  const cld = await getCloudinary();
  const { publicId } = await uploadBuffer(input, "salonx/ramp/work/face");
  const width = opts?.width ?? 640;
  const height = opts?.height ?? 760;
  const zoom = opts?.zoom ?? 0.55;
  const url = cld.url(publicId, {
    resource_type: "image",
    secure: true,
    transformation: [
      { gravity: "face", crop: "thumb", width, height, zoom },
      { fetch_format: "png" },
    ],
  });
  const buffer = await fetchDerived(url, "face-crop");
  return { buffer, publicId };
}

/**
 * Re-paste the REAL face crop onto the AI-generated poster, positioned on the
 * poster's detected face (face gravity) and sized relative to that face region,
 * with feathered edges so the seam is soft. Returns the composited JPEG.
 *
 * This is the "face-lock" step: the AI may have adjusted body/pose, but the
 * final face pixels are the subject's real face.
 */
export async function cloudinaryFaceRepaste(input: {
  posterBuffer: Buffer;
  faceBuffer: Buffer;
  /** Overlay width relative to the poster's detected face region (1.0 = same). */
  regionScale?: number;
  /** Feather radius in px for a soft seam. */
  feather?: number;
}): Promise<Buffer> {
  const cld = await getCloudinary();
  const [{ publicId: posterId }, { publicId: faceId }] = await Promise.all([
    uploadBuffer(input.posterBuffer, "salonx/ramp/work/poster"),
    uploadBuffer(input.faceBuffer, "salonx/ramp/work/faceovl"),
  ]);

  const regionScale = input.regionScale ?? 1.25;
  const feather = input.feather ?? 30;

  const url = cld.url(posterId, {
    resource_type: "image",
    secure: true,
    transformation: [
      {
        overlay: faceId,
        width: regionScale,
        flags: "region_relative",
      },
      { effect: `feather:${feather}` },
      // Basic face gravity (adv_face add-on is not enabled on this account).
      { flags: "layer_apply", gravity: "face" },
      { fetch_format: "jpg", quality: "auto:good" },
    ],
  });
  return fetchDerived(url, "face-repaste");
}
