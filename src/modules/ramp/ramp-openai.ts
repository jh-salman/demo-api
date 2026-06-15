import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildRampAiPrompt,
  buildRampBackgroundPassPrompt,
  buildRampHybridPosterPrompt,
  buildRampSelfieCompositePrompt,
  normalizeRampBrandLayer,
  normalizeRampCapturePath,
  normalizeRampImageEdit,
  normalizeRampPostStylePreset,
  normalizeRampVisualDirection,
  type RampPromptConfig,
} from "./ramp-ai-prompts.js";
import {
  cloudinaryCutout,
  cloudinaryFaceRepaste,
  isCloudinaryConfigured,
} from "./ramp-cloudinary.js";

export function isOpenAiMockMode(): boolean {
  const raw = process.env.OPENAI_API_KEY?.trim();
  return !raw;
}

export type RampGenerationInput = {
  sourceImageUrl: string;
  postStyle: string;
  recipientName: string;
  stylistName: string;
  brandSlug: string;
  reqOrigin?: string;
  capturePath?: string;
  visualDirection?: string;
  imageEdit?: string;
  brandLayer?: string;
  captureType?: string;
  /** Optional freeform edit instruction supplied on a regenerate request. */
  extraNote?: string;
  backgroundPosterUrl?: string;
  stylistStyleReferenceUrl?: string;
  clientStyleReferenceUrl?: string;
  /** @deprecated */
  referencePosterUrl?: string;
  /** Brand-supplied poster copy for the hybrid pipeline. */
  posterHeadline?: string;
  posterTags?: string[];
  posterLink?: string;
  posterAttribution?: string;
};

function toPromptConfig(input: RampGenerationInput): RampPromptConfig {
  return {
    capturePath: normalizeRampCapturePath(input.capturePath, input.captureType),
    postStyle: normalizeRampPostStylePreset(input.postStyle),
    visualDirection: normalizeRampVisualDirection(input.visualDirection),
    imageEdit: normalizeRampImageEdit(input.imageEdit),
    brandLayer: normalizeRampBrandLayer(input.brandLayer),
    brandSlug: input.brandSlug,
    recipientName: input.recipientName,
    stylistName: input.stylistName,
    extraNote: input.extraNote,
  };
}

/** Force JPEG delivery for Cloudinary captures (HEIC/WebP → JPG server-side). */
function toOpenAiSafeImageUrl(url: string): string {
  const trimmed = url.trim();
  if (
    !trimmed.includes("res.cloudinary.com") ||
    !trimmed.includes("/image/upload/")
  ) {
    return trimmed;
  }
  if (/\/image\/upload\/[^/]*f_jpg/.test(trimmed)) return trimmed;
  return trimmed.replace(
    "/image/upload/",
    "/image/upload/f_jpg,q_auto:good,fl_progressive/",
  );
}

function imagePartFromBuffer(buffer: Buffer): { blob: Blob; filename: string } {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    return { blob: new Blob([buffer], { type: "image/jpeg" }), filename: "capture.jpg" };
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { blob: new Blob([buffer], { type: "image/png" }), filename: "capture.png" };
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { blob: new Blob([buffer], { type: "image/webp" }), filename: "capture.webp" };
  }
  // Unknown format — still attempt OpenAI as JPEG (Cloudinary often delivers convertible bytes).
  return { blob: new Blob([buffer], { type: "image/jpeg" }), filename: "capture.jpg" };
}

async function fetchImageBuffer(url: string): Promise<Buffer> {
  const safeUrl = toOpenAiSafeImageUrl(url);
  const res = await fetch(safeUrl);
  if (!res.ok) throw new Error(`Could not download source image (${res.status})`);
  const ab = await res.arrayBuffer();
  const buffer = Buffer.from(ab);
  if (buffer.length < 32) {
    throw new Error("Source photo download was empty or corrupt");
  }
  return buffer;
}

export async function uploadGeneratedBuffer(
  buffer: Buffer,
  reqOrigin?: string,
): Promise<string> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const cloudKey = process.env.CLOUDINARY_API_KEY?.trim();
  const cloudSecret = process.env.CLOUDINARY_API_SECRET?.trim();

  if (cloudName && cloudKey && cloudSecret) {
    const { v2: cld } = await import("cloudinary");
    cld.config({ cloud_name: cloudName, api_key: cloudKey, api_secret: cloudSecret });
    const uploaded = await new Promise<{ secure_url: string }>((resolve, reject) => {
      const stream = cld.uploader.upload_stream(
        {
          folder: "salonx/ramp/generated",
          public_id: randomUUID(),
          resource_type: "image",
          overwrite: false,
        },
        (err, result) => {
          if (err) reject(err);
          else if (!result?.secure_url) reject(new Error("Cloudinary upload failed"));
          else resolve(result as { secure_url: string });
        },
      );
      stream.end(buffer);
    });
    return uploaded.secure_url;
  }

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`ramp/generated/${randomUUID()}.jpg`, buffer, {
      access: "public",
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: false,
      contentType: "image/jpeg",
    });
    return blob.url;
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "ramp");
  await mkdir(uploadDir, { recursive: true });
  const filename = `${randomUUID()}.jpg`;
  await writeFile(path.join(uploadDir, filename), buffer);
  const origin =
    reqOrigin ||
    process.env.PUBLIC_SITE_URL?.trim()?.replace(/\/$/, "") ||
    "http://localhost:4000";
  return `${origin.replace(/\/$/, "")}/uploads/ramp/${filename}`;
}

type ImagePart = { blob: Blob; filename: string };

/**
 * Single OpenAI `images/edits` call with retry. Returns the raw image bytes so
 * the result can be fed forward into a follow-up compositing pass.
 */
async function runOpenAiImageEdit(params: {
  apiKey: string;
  model: string;
  prompt: string;
  images: ImagePart[];
  size?: string;
}): Promise<Buffer> {
  const { apiKey, model, prompt, images } = params;
  const size = params.size || "1024x1536";
  const maxAttempts = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", prompt);
    form.append("size", size);
    for (const part of images) {
      form.append("image[]", part.blob, part.filename);
    }

    const res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    const json = (await res.json().catch(() => ({}))) as {
      data?: Array<{ b64_json?: string; url?: string }>;
      error?: { message?: string };
    };

    if (!res.ok) {
      lastError = new Error(json.error?.message || `OpenAI image generation failed (${res.status})`);
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
        continue;
      }
      throw lastError;
    }

    const first = json.data?.[0];
    if (first?.b64_json) {
      return Buffer.from(first.b64_json, "base64");
    }
    if (first?.url) {
      return fetchImageBuffer(first.url);
    }

    lastError = new Error("OpenAI returned no image data");
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
    }
  }

  throw lastError || new Error("OpenAI image generation failed");
}

async function generateWithOpenAi(
  input: RampGenerationInput,
): Promise<{ imageUrl: string; mock: boolean }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { imageUrl: input.sourceImageUrl, mock: true };
  }

  const model = process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1";
  const capturePath = normalizeRampCapturePath(input.capturePath, input.captureType);
  const backgroundUrl = String(input.backgroundPosterUrl || "").trim();
  const legacyReferenceUrl = String(input.referencePosterUrl || "").trim();
  const stylistStyleUrl =
    String(input.stylistStyleReferenceUrl || "").trim() || legacyReferenceUrl;
  const clientStyleUrl = String(input.clientStyleReferenceUrl || "").trim();
  const styleRefUrl = capturePath === "client_path" ? clientStyleUrl : stylistStyleUrl;

  const sourceBuffer = await fetchImageBuffer(input.sourceImageUrl);
  const selfiePart = imagePartFromBuffer(sourceBuffer);

  let backgroundPart: ImagePart | null = null;
  let styleRefPart: ImagePart | null = null;

  if (backgroundUrl) {
    try {
      const bgBuffer = await fetchImageBuffer(backgroundUrl);
      backgroundPart = imagePartFromBuffer(bgBuffer);
    } catch (e) {
      console.warn("[ramp:openai] background poster fetch failed", e);
    }
  }
  if (styleRefUrl) {
    try {
      const refBuffer = await fetchImageBuffer(styleRefUrl);
      styleRefPart = imagePartFromBuffer(refBuffer);
    } catch (e) {
      console.warn("[ramp:openai] style reference fetch failed", e);
    }
  }

  // ── TWO-PASS PIPELINE (selfie composited LAST) ───────────────────────────
  // When a background poster is supplied, do ALL the tags / attribution /
  // branding / modeling on the BACKGROUND first (no selfie in this pass), then
  // composite the live selfie as the final, untouched layer. The face never
  // enters the text-generation pass, so its likeness can't be corrupted.
  if (backgroundPart) {
    const stage1Images: ImagePart[] = [backgroundPart];
    if (styleRefPart) stage1Images.push(styleRefPart);

    const backgroundPrompt = buildRampBackgroundPassPrompt({
      recipientName: input.recipientName,
      stylistName: input.stylistName,
      brandSlug: input.brandSlug,
      capturePath,
      extraNote: input.extraNote,
      hasStyleReference: Boolean(styleRefPart),
    });

    const finishedBackground = await runOpenAiImageEdit({
      apiKey,
      model,
      prompt: backgroundPrompt,
      images: stage1Images,
    });
    const finishedBackgroundPart = imagePartFromBuffer(finishedBackground);

    const compositePrompt = buildRampSelfieCompositePrompt({
      recipientName: input.recipientName,
      stylistName: input.stylistName,
      capturePath,
      extraNote: input.extraNote,
    });

    const finalBuffer = await runOpenAiImageEdit({
      apiKey,
      model,
      prompt: compositePrompt,
      // Selfie FIRST as the protected hero layer, finished poster SECOND.
      images: [selfiePart, finishedBackgroundPart],
    });

    const hosted = await uploadGeneratedBuffer(finalBuffer, input.reqOrigin);
    return { imageUrl: hosted, mock: false };
  }

  // ── SINGLE-PASS FALLBACK (no background poster supplied) ──────────────────
  const prompt = buildRampAiPrompt(toPromptConfig(input));
  const finalBuffer = await runOpenAiImageEdit({
    apiKey,
    model,
    prompt,
    images: [selfiePart],
  });
  const hosted = await uploadGeneratedBuffer(finalBuffer, input.reqOrigin);
  return { imageUrl: hosted, mock: false };
}

export async function generateBrandedRampImage(
  input: RampGenerationInput,
): Promise<{ imageUrl: string; mock: boolean; usedFallback?: boolean }> {
  if (isOpenAiMockMode()) {
    return { imageUrl: input.sourceImageUrl, mock: true };
  }
  try {
    return await generateWithOpenAi(input);
  } catch (e) {
    const message = e instanceof Error ? e.message : "OpenAI unavailable";
    console.warn("[ramp:openai] fail-safe — using source photo", message);
    return { imageUrl: input.sourceImageUrl, mock: true, usedFallback: true };
  }
}

/**
 * HYBRID FACE-LOCK pipeline:
 *   1. Cutout the subject (Cloudinary background removal) — face/body preserved.
 *   2. OpenAI composes one professional poster from [cutout, background],
 *      adjusting the BODY/pose and rendering all brand text/tags/overlay.
 *   3. Re-paste the subject's REAL face over the AI poster (face gravity +
 *      feather) so the final face is 100% the real person.
 *
 * Each stage degrades gracefully:
 *   • cutout fails        → feed the raw photo to OpenAI instead
 *   • OpenAI fails        → caller's fail-safe (raw photo) via thrown error
 *   • face re-paste fails → return the AI poster without re-paste
 */
async function generateHybridWithOpenAi(
  input: RampGenerationInput,
): Promise<{ imageUrl: string; mock: boolean }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { imageUrl: input.sourceImageUrl, mock: true };

  const model = process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1";
  const capturePath = normalizeRampCapturePath(input.capturePath, input.captureType);
  const backgroundUrl = String(input.backgroundPosterUrl || "").trim();

  // Original capture — kept as the real-face source for the re-paste step.
  const sourceBuffer = await fetchImageBuffer(input.sourceImageUrl);

  // ── Stage 1: subject cutout (background removed) ──────────────────────────
  let subjectBuffer = sourceBuffer;
  let cutoutOk = false;
  if (isCloudinaryConfigured()) {
    try {
      subjectBuffer = await cloudinaryCutout(sourceBuffer);
      cutoutOk = true;
    } catch (e) {
      console.warn(
        "[ramp:hybrid] cutout failed — feeding raw photo to OpenAI:",
        e instanceof Error ? e.message : e,
      );
    }
  }
  const subjectPart = imagePartFromBuffer(subjectBuffer);

  // ── Stage 2: AI poster (body adjusted + brand text), background optional ──
  const hybridPrompt = buildRampHybridPosterPrompt({
    recipientName: input.recipientName,
    stylistName: input.stylistName,
    brandSlug: input.brandSlug,
    capturePath,
    headline: input.posterHeadline,
    tags: input.posterTags,
    link: input.posterLink,
    attribution: input.posterAttribution,
    extraNote: input.extraNote,
  });

  const images: ImagePart[] = [subjectPart];
  if (backgroundUrl) {
    try {
      const bgBuffer = await fetchImageBuffer(backgroundUrl);
      images.push(imagePartFromBuffer(bgBuffer));
    } catch (e) {
      console.warn("[ramp:hybrid] background fetch failed — single-image edit", e);
    }
  }

  const aiPoster = await runOpenAiImageEdit({ apiKey, model, prompt: hybridPrompt, images });

  // ── Stage 3: re-paste the REAL face over the AI poster (face-lock) ────────
  if (isCloudinaryConfigured()) {
    try {
      const locked = await cloudinaryFaceRepaste({
        posterBuffer: aiPoster,
        faceBuffer: sourceBuffer,
      });
      const hosted = await uploadGeneratedBuffer(locked, input.reqOrigin);
      return { imageUrl: hosted, mock: false };
    } catch (e) {
      console.warn(
        "[ramp:hybrid] face re-paste failed — returning AI poster as-is:",
        e instanceof Error ? e.message : e,
        cutoutOk ? "(cutout ok)" : "(no cutout)",
      );
    }
  }

  const hosted = await uploadGeneratedBuffer(aiPoster, input.reqOrigin);
  return { imageUrl: hosted, mock: false };
}

export async function generateHybridRampImage(
  input: RampGenerationInput,
): Promise<{ imageUrl: string; mock: boolean; usedFallback?: boolean }> {
  if (isOpenAiMockMode()) {
    return { imageUrl: input.sourceImageUrl, mock: true };
  }
  try {
    return await generateHybridWithOpenAi(input);
  } catch (e) {
    const message = e instanceof Error ? e.message : "OpenAI unavailable";
    console.warn("[ramp:hybrid] fail-safe — using source photo", message);
    return { imageUrl: input.sourceImageUrl, mock: true, usedFallback: true };
  }
}
