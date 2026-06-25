import "dotenv/config";
import { readFile } from "node:fs/promises";
import OpenAI from "openai";
import { toFile } from "openai";
import type { Uploadable } from "openai/uploads";

export const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/** OpenAI state-of-the-art image model (Apr 2026). */
export const RAMP_IMAGE_MODEL = "gpt-image-2";

type ImageSize = "1024x1024" | "1024x1536" | "1536x1024";

type ImageGenOptions = {
  model?: string;
  size?: ImageSize;
};

function extractImageBase64(data: OpenAI.Images.ImagesResponse["data"]): string | undefined {
  const item = data?.[0];
  if (item?.b64_json) return item.b64_json;
  return undefined;
}

async function fetchImageBase64FromUrl(url: string): Promise<string | undefined> {
  const res = await fetch(url);
  if (!res.ok) return undefined;
  return Buffer.from(await res.arrayBuffer()).toString("base64");
}

async function resolveImageBase64(
  image: OpenAI.Images.ImagesResponse,
): Promise<string | undefined> {
  const direct = extractImageBase64(image.data);
  if (direct) return direct;
  const url = image.data?.[0]?.url;
  if (!url) return undefined;
  return fetchImageBase64FromUrl(url);
}

/** Text-only → new image. */
export async function generateImageBase64(
  prompt: string,
  options?: ImageGenOptions,
): Promise<string | undefined> {
  const image = await client.images.generate({
    model: options?.model ?? RAMP_IMAGE_MODEL,
    prompt,
    size: options?.size ?? "1024x1024",
    quality: "high",
  });
  return resolveImageBase64(image);
}

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function resolveImageMimeType(filename: string, mimeType?: string): string {
  if (mimeType && mimeType.startsWith("image/")) return mimeType;
  const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));
  return IMAGE_MIME_BY_EXT[ext] ?? "image/png";
}

async function toUploadableSource(
  source: Uploadable | Buffer,
  filename = "source.png",
  mimeType?: string,
): Promise<Uploadable> {
  if (Buffer.isBuffer(source)) {
    return toFile(source, filename, { type: resolveImageMimeType(filename, mimeType) });
  }
  return source;
}

type ReferenceImageOptions = ImageGenOptions & {
  filename?: string;
  mimeType?: string;
};

/** User image + prompt → new image (reference / edit workflow). */
export async function editImageFromReferenceBase64(
  sourceImage: Uploadable | Buffer,
  prompt: string,
  options?: ReferenceImageOptions,
): Promise<string | undefined> {
  const filename = options?.filename ?? "source.png";
  const image = await client.images.edit({
    model: options?.model ?? RAMP_IMAGE_MODEL,
    image: await toUploadableSource(sourceImage, filename, options?.mimeType),
    prompt,
    size: options?.size ?? "1024x1024",
    quality: "high",
  });
  return resolveImageBase64(image);
}

/** Load remote image URL and run reference edit. */
export async function editImageFromReferenceUrlBase64(
  imageUrl: string,
  prompt: string,
  options?: ReferenceImageOptions,
): Promise<string | undefined> {
  const res = await fetch(imageUrl);
  if (!res.ok) return undefined;
  const buffer = Buffer.from(await res.arrayBuffer());
  const urlPath = new URL(imageUrl).pathname;
  const filename = urlPath.split("/").pop() || "source.png";
  const mimeType = res.headers.get("content-type") ?? undefined;
  return editImageFromReferenceBase64(buffer, prompt, {
    ...options,
    filename,
    mimeType,
  });
}

export async function openSourceImageUploadable(
  path: string,
  filename = "source.png",
  mimeType?: string,
): Promise<Uploadable> {
  const buffer = await readFile(path);
  return toFile(buffer, filename, {
    type: resolveImageMimeType(filename, mimeType),
  });
}
