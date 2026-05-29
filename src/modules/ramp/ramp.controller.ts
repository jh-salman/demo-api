import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { HttpError } from "../../middleware/error.middleware.js";
import { rampService } from "./ramp.service.js";
import type { StoreSharedSelfieRequest, StartStylistPostRequest, FireClientCareCardRequest } from "./ramp.types.js";

export const rampController = {
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

  startStylistPost: asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as StartStylistPostRequest;
    if (!body || typeof body !== "object") {
      throw new HttpError(400, "Expected JSON object");
    }
    try {
      res.json(await rampService.startStylistPost(req, body));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "start-stylist-post failed";
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

  listRecent: asyncHandler(async (req: Request, res: Response) => {
    const limit = Number(req.query.limit) || 24;
    res.json({ ok: true, ...(await rampService.listRecent(limit)) });
  }),

  submitRampCapture: asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as StoreSharedSelfieRequest;
    if (!body || typeof body !== "object") {
      throw new HttpError(400, "Expected JSON object");
    }
    try {
      res.json(await rampService.submitRampCapture(req, body));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "submit-capture failed";
      if (msg.includes("Unknown RAMP") || msg.includes("token and mediaUrl")) {
        throw new HttpError(400, msg);
      }
      throw new HttpError(500, msg);
    }
  }),

  getStatus: asyncHandler(async (req: Request, res: Response) => {
    const token = String(req.params.token || "").trim();
    if (!token) throw new HttpError(400, "token required");
    const post = await rampService.getPostStatus(req, token);
    if (!post) throw new HttpError(404, "RAMP post not found");
    res.json({ ok: true, post });
  }),

  regenerate: asyncHandler(async (req: Request, res: Response) => {
    const token = String(req.params.token || "").trim();
    if (!token) throw new HttpError(400, "token required");
    const body = (req.body && typeof req.body === "object" ? req.body : {}) as {
      note?: string;
      visualDirection?: string;
      imageEdit?: string;
    };
    try {
      res.json(
        await rampService.regenerate(req, token, {
          note: typeof body.note === "string" ? body.note : undefined,
          visualDirection:
            typeof body.visualDirection === "string" ? body.visualDirection : undefined,
          imageEdit: typeof body.imageEdit === "string" ? body.imageEdit : undefined,
        }),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "regenerate failed";
      if (msg.includes("Unknown RAMP") || msg.includes("No source capture")) {
        throw new HttpError(400, msg);
      }
      throw new HttpError(500, msg);
    }
  }),

  sendSms: asyncHandler(async (req: Request, res: Response) => {
    const token = String(req.params.token || "").trim();
    if (!token) throw new HttpError(400, "token required");
    try {
      res.json(await rampService.sendRampPostSms(req, token));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "send-sms failed";
      if (
        msg.includes("Unknown RAMP") ||
        msg.includes("not ready") ||
        msg.includes("phone number")
      ) {
        throw new HttpError(400, msg);
      }
      throw new HttpError(500, msg);
    }
  }),

  fireCareCard: asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as FireClientCareCardRequest;
    if (!body || typeof body !== "object") {
      throw new HttpError(400, "Expected JSON object");
    }
    try {
      res.json(await rampService.fireClientCareCard(req, body));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "fire-care-card failed";
      if (msg.includes("phone number")) {
        throw new HttpError(400, msg);
      }
      throw new HttpError(500, msg);
    }
  }),
};
