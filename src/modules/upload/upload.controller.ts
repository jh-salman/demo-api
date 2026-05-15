import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { HttpError } from "../../middleware/error.middleware.js";
import { publicSiteOrigin } from "../../lib/public-url.js";

const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function extFor(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/gif") return "gif";
  if (mime === "image/webp") return "webp";
  if (mime === "image/heic" || mime === "image/heif") return "heic";
  if (mime.startsWith("video/")) {
    if (mime === "video/webm") return "webm";
    if (mime === "video/quicktime") return "mov";
    if (mime === "video/x-msvideo") return "avi";
    return "mp4";
  }
  return "jpg";
}

function sniffMime(file: Express.Multer.File, fallback: string): string {
  let mime = (file.mimetype || "").toLowerCase();
  if (mime) return mime;
  const name = (file.originalname || "").toLowerCase();
  if (/\.(jpe?g)$/.test(name)) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".heic") || name.endsWith(".heif")) return "image/heic";
  if (name.endsWith(".mp4") || name.endsWith(".m4v")) return "video/mp4";
  if (name.endsWith(".webm")) return "video/webm";
  if (name.endsWith(".mov")) return "video/quicktime";
  if (name.endsWith(".avi")) return "video/x-msvideo";
  return fallback;
}

function normalizeMime(raw: string, file: Express.Multer.File): string {
  let mime = (raw || "").toLowerCase();
  if (!mime.startsWith("image/") && !mime.startsWith("video/")) {
    mime = sniffMime(file, "image/jpeg");
  }
  if (mime.startsWith("image/") && !IMAGE_MIMES.has(mime)) {
    if (mime === "image/jpg") return "image/jpeg";
    return "image/jpeg";
  }
  if (mime === "application/octet-stream") {
    const n = (file.originalname || "").toLowerCase();
    if (/\.(mp4|m4v)$/.test(n)) return "video/mp4";
    if (/\.webm$/.test(n)) return "video/webm";
    if (/\.mov$/.test(n)) return "video/quicktime";
  }
  return mime;
}

function isAllowedMime(mime: string): boolean {
  if (mime.startsWith("image/")) {
    return mime !== "image/svg+xml";
  }
  if (mime.startsWith("video/")) return true;
  return false;
}

async function safeUnlink(p: string) {
  try {
    await unlink(p);
  } catch {
    /* */
  }
}

export const uploadController = {
  post: asyncHandler(async (req: Request, res: Response) => {
    const file = req.file;
    if (!file || file.size <= 0) {
      throw new HttpError(400, "Missing file field");
    }

    const mime = normalizeMime(file.mimetype, file);
    if (!isAllowedMime(mime)) {
      await safeUnlink(file.path);
      throw new HttpError(400, "Unsupported file type");
    }

    const isVideo = mime.startsWith("video/");
    const id = randomUUID();
    const ext = extFor(mime);
    const filename = `${id}.${ext}`;

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
      const uploaded = await new Promise<{ secure_url: string }>((resolve, reject) => {
        const uploadStream = cld.uploader.upload_stream(
          {
            folder: "salonx/build-station",
            public_id: `${isVideo ? "video" : "s1"}/${id}`,
            resource_type: isVideo ? "video" : "image",
            overwrite: false,
          },
          (err, result) => {
            if (err) reject(err);
            else if (!result?.secure_url) reject(new Error("Cloudinary upload failed"));
            else resolve(result as { secure_url: string });
          },
        );
        void (async () => {
          try {
            const src = createReadStream(file.path);
            await pipeline(src, uploadStream);
            await safeUnlink(file.path);
          } catch (e) {
            await safeUnlink(file.path);
            reject(e);
          }
        })();
      });
      res.json({
        url: uploaded.secure_url,
        path: uploaded.secure_url,
        storage: "cloudinary",
      });
      return;
    }

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const { put } = await import("@vercel/blob");
      const buf = await readFile(file.path);
      await safeUnlink(file.path);
      const blob = await put(`s1/${filename}`, buf, {
        access: "public",
        token: process.env.BLOB_READ_WRITE_TOKEN,
        addRandomSuffix: false,
        contentType: mime,
      });
      res.json({
        url: blob.url,
        path: blob.url,
        storage: "vercel-blob",
      });
      return;
    }

    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });
    const absPath = path.join(uploadDir, filename);
    await pipeline(createReadStream(file.path), createWriteStream(absPath));
    await safeUnlink(file.path);

    const origin = publicSiteOrigin(req);
    const url = `${origin}/uploads/${filename}`;
    res.json({
      url,
      path: `/uploads/${filename}`,
      storage: "local-disk",
    });
  }),
};
