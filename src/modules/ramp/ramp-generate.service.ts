import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env.js";
import { emitRampPostUpdated } from "../../realtime/io.js";
import {
  editImageFromReferenceUrlBase64,
  generateImageBase64,
} from "./ramp.ai.js";
import { rampPostToDto, rampService } from "./ramp-runtime.service.js";

const activeJobs = new Set<string>();

type TagRow = { label?: string; on?: boolean };

function buildRampImagePrompt(post: ReturnType<typeof rampPostToDto>): string {
  const name = String(post.clientName || "the client").trim() || "the client";
  const type = post.type || "Curiosity";
  const caption = String(post.caption || "").trim();
  const tags = (Array.isArray(post.tags) ? post.tags : [])
    .filter((tag): tag is TagRow => Boolean(tag && typeof tag === "object"))
    .filter((tag) => tag.on !== false && tag.label)
    .map((tag) => String(tag.label))
    .join(", ");

  return [
    `Transform this photo into a premium salon social media post for ${name}.`,
    `Post type: ${type}.`,
    caption ? `Caption direction: ${caption}` : "",
    tags ? `Brand tags: ${tags}` : "",
    "Keep the subject recognizable. Elegant branded layout, high-end salon aesthetic.",
  ]
    .filter(Boolean)
    .join(" ");
}

async function uploadPngBuffer(buffer: Buffer): Promise<string> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const cloudKey = process.env.CLOUDINARY_API_KEY?.trim();
  const cloudSecret = process.env.CLOUDINARY_API_SECRET?.trim();

  if (cloudName && cloudKey && cloudSecret) {
    const { v2: cld } = await import("cloudinary");
    cld.config({
      cloud_name: cloudName,
      api_key: cloudKey,
      api_secret: cloudSecret,
    });
    const id = randomUUID();
    const uploaded = await new Promise<{ secure_url: string }>((resolve, reject) => {
      const uploadStream = cld.uploader.upload_stream(
        {
          folder: "salonx/ramp",
          public_id: `composed/${id}`,
          resource_type: "image",
          format: "png",
          overwrite: false,
        },
        (err, result) => {
          if (err) reject(err);
          else if (!result?.secure_url) reject(new Error("Cloudinary upload failed"));
          else resolve(result as { secure_url: string });
        },
      );
      uploadStream.end(buffer);
    });
    return uploaded.secure_url;
  }

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const id = randomUUID();
    const blob = await put(`ramp/composed/${id}.png`, buffer, {
      access: "public",
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: false,
      contentType: "image/png",
    });
    return blob.url;
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "ramp");
  await mkdir(uploadDir, { recursive: true });
  const filename = `${randomUUID()}.png`;
  const absPath = path.join(uploadDir, filename);
  await writeFile(absPath, buffer);
  const origin =
    process.env.PUBLIC_SITE_URL?.trim()?.replace(/\/$/, "") ||
    process.env.RENDER_EXTERNAL_URL?.trim()?.replace(/\/$/, "") ||
    "http://localhost:4000";
  return `${origin}/uploads/ramp/${filename}`;
}

async function markGenerationError(id: string) {
  try {
    const post = await rampService.update(id, { genState: "error" });
    emitRampPostUpdated({ post });
  } catch (err) {
    console.error("[ramp-generate] failed to mark error", id, err);
  }
}

async function runGenerationJob(id: string) {
  const post = await rampService.get(id);
  if (!post || post.genState !== "generating") return;

  if (!env.OPENAI_API_KEY) {
    await markGenerationError(id);
    return;
  }

  const prompt = buildRampImagePrompt(post);
  if (!prompt) {
    await markGenerationError(id);
    return;
  }

  const isStation = post.source === "station";
  const heroImage = String(post.heroImage || "").trim();

  let b64: string | undefined;
  try {
    if (heroImage) {
      b64 = await editImageFromReferenceUrlBase64(heroImage, prompt);
    } else if (isStation) {
      b64 = await generateImageBase64(prompt);
    } else {
      await markGenerationError(id);
      return;
    }
  } catch (err) {
    console.error("[ramp-generate] OpenAI failed", id, err);
    await markGenerationError(id);
    return;
  }

  if (!b64) {
    await markGenerationError(id);
    return;
  }

  try {
    const buffer = Buffer.from(b64, "base64");
    const url = await uploadPngBuffer(buffer);
    const updated = await rampService.addGeneratedImage(id, url);
    if (updated) emitRampPostUpdated({ post: updated });
  } catch (err) {
    console.error("[ramp-generate] upload failed", id, err);
    await markGenerationError(id);
  }
}

export const rampGenerateService = {
  isActive(id: string) {
    return activeJobs.has(id);
  },

  /** Fire-and-forget background generation (survives HTTP response). */
  runInBackground(id: string) {
    if (activeJobs.has(id)) return;
    activeJobs.add(id);
    void runGenerationJob(id)
      .catch((err) => {
        console.error("[ramp-generate] unexpected failure", id, err);
        return markGenerationError(id);
      })
      .finally(() => {
        activeJobs.delete(id);
      });
  },
};
