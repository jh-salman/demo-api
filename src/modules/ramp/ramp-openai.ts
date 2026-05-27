import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildRampAiPrompt,
  normalizeRampBrandLayer,
  normalizeRampCapturePath,
  normalizeRampImageEdit,
  normalizeRampPostStylePreset,
  normalizeRampVisualDirection,
  type RampPromptConfig,
} from "./ramp-ai-prompts.js";

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
  };
}

async function fetchImageBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download source image (${res.status})`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

async function uploadGeneratedBuffer(
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

async function generateWithOpenAi(
  input: RampGenerationInput,
): Promise<{ imageUrl: string; mock: boolean }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { imageUrl: input.sourceImageUrl, mock: true };
  }

  const model = process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1";
  const prompt = buildRampAiPrompt(toPromptConfig(input));
  const sourceBuffer = await fetchImageBuffer(input.sourceImageUrl);
  const form = new FormData();
  form.append("model", model);
  form.append("prompt", prompt);
  form.append("size", "1024x1536");
  form.append("image[]", new Blob([sourceBuffer], { type: "image/jpeg" }), "capture.jpg");

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
    throw new Error(json.error?.message || `OpenAI image generation failed (${res.status})`);
  }

  const first = json.data?.[0];
  if (first?.url) {
    return { imageUrl: first.url, mock: false };
  }
  if (first?.b64_json) {
    const out = Buffer.from(first.b64_json, "base64");
    const hosted = await uploadGeneratedBuffer(out, input.reqOrigin);
    return { imageUrl: hosted, mock: false };
  }

  throw new Error("OpenAI returned no image data");
}

export async function generateBrandedRampImage(
  input: RampGenerationInput,
): Promise<{ imageUrl: string; mock: boolean }> {
  if (isOpenAiMockMode()) {
    return { imageUrl: input.sourceImageUrl, mock: true };
  }
  return generateWithOpenAi(input);
}
