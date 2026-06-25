import { unlink } from "node:fs/promises";
import type { Request, Response } from "express";
import { env } from "../../config/env.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  editImageFromReferenceBase64,
  editImageFromReferenceUrlBase64,
  generateImageBase64,
  openSourceImageUploadable,
} from "./ramp.ai.js";

const IMAGE_SIZES = new Set(["1024x1024", "1024x1536", "1536x1024"]);

async function safeUnlink(path: string) {
  try {
    await unlink(path);
  } catch {
    /* */
  }
}

function parseImageSize(raw: unknown): "1024x1024" | "1024x1536" | "1536x1024" | undefined {
  return typeof raw === "string" && IMAGE_SIZES.has(raw)
    ? (raw as "1024x1024" | "1024x1536" | "1536x1024")
    : undefined;
}

function sendPng(res: Response, b64_json: string) {
  const imageBuffer = Buffer.from(b64_json, "base64");
  res.setHeader("Content-Type", "image/png");
  res.send(imageBuffer);
}

export const rampController = {
  generateImage: asyncHandler(async (req: Request, res: Response) => {
    if (!env.OPENAI_API_KEY) {
      res.status(503).json({ error: "OPENAI_API_KEY is not configured" });
      return;
    }

    const prompt = String(req.body?.prompt ?? "").trim();
    if (!prompt) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    const model =
      typeof req.body?.model === "string" && req.body.model.trim()
        ? req.body.model.trim()
        : undefined;
    const size = parseImageSize(req.body?.size);
    const opts = { model, size };

    const imageUrl = String(req.body?.imageUrl ?? req.body?.url ?? "").trim();
    const upload = req.file;

    if (upload?.path) {
      try {
        const source = await openSourceImageUploadable(
          upload.path,
          upload.originalname || "source.png",
          upload.mimetype,
        );
        const b64_json = await editImageFromReferenceBase64(source, prompt, {
          ...opts,
          filename: upload.originalname || "source.png",
          mimeType: upload.mimetype,
        });
        if (!b64_json) {
          res.status(502).json({ error: "Image edit returned no data" });
          return;
        }
        sendPng(res, b64_json);
      } finally {
        await safeUnlink(upload.path);
      }
      return;
    }

    if (imageUrl) {
      const b64_json = await editImageFromReferenceUrlBase64(imageUrl, prompt, opts);
      if (!b64_json) {
        res.status(502).json({ error: "Image edit returned no data" });
        return;
      }
      sendPng(res, b64_json);
      return;
    }

    const b64_json = await generateImageBase64(prompt, opts);
    if (!b64_json) {
      res.status(502).json({ error: "Image generation returned no data" });
      return;
    }
    sendPng(res, b64_json);
  }),
};
