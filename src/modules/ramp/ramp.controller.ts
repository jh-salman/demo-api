import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { HttpError } from "../../middleware/error.middleware.js";
import { rampService } from "./ramp.service.js";
import type { FireCareCardRequest, StoreSharedSelfieRequest } from "./ramp.types.js";

export const rampController = {
  fireCareCard: asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as FireCareCardRequest;
    if (!body || typeof body !== "object") {
      throw new HttpError(400, "Expected JSON object");
    }
    try {
      res.status(201).json(await rampService.fireCareCard(req, body));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "fire-care-card failed";
      if (msg.includes("recipientPhone")) throw new HttpError(400, msg);
      throw new HttpError(500, msg);
    }
  }),

  getPost: asyncHandler(async (req: Request, res: Response) => {
    const token = String(req.params.token || "").trim();
    if (!token) throw new HttpError(400, "token required");
    const post = await rampService.getPostByToken(req, token);
    if (!post) throw new HttpError(404, "RAMP post not found");
    res.json({ ok: true, post });
  }),

  storeSharedSelfie: asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as StoreSharedSelfieRequest;
    if (!body || typeof body !== "object") {
      throw new HttpError(400, "Expected JSON object");
    }
    try {
      res.json(await rampService.storeSharedSelfie(body));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "store-shared-selfie failed";
      if (msg.includes("Unknown RAMP") || msg.includes("token and mediaUrl")) {
        throw new HttpError(400, msg);
      }
      throw new HttpError(500, msg);
    }
  }),

  trackCopy: asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { token?: string; eventType?: string };
    const token = String(body?.token || req.params.token || "").trim();
    if (!token) throw new HttpError(400, "token required");
    try {
      res.json(await rampService.trackCopy(token, body?.eventType || "caption_copy"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "track-copy failed";
      throw new HttpError(400, msg);
    }
  }),

  careCardSvg: asyncHandler(async (req: Request, res: Response) => {
    const raw = String(req.params.token || "").trim();
    const token = raw.replace(/\.svg$/i, "");
    if (!token) throw new HttpError(400, "token required");
    const svg = await rampService.getCareCardSvg(token);
    if (!svg) throw new HttpError(404, "Care card not found");
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(svg);
  }),
};
