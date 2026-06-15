import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { HttpError } from "../../middleware/error.middleware.js";
import { rampService } from "./ramp.service.js";
import type {
  StoreSharedSelfieRequest,
  StartStylistPostRequest,
  FireClientCareCardRequest,
  InboundMmsRequest,
  ParkPickRequest,
  UpdateRampRecipientRequest,
  PatchRampDraftRequest,
  CompositeRampRequest,
} from "./ramp.types.js";

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

  listLibrary: asyncHandler(async (req: Request, res: Response) => {
    const limit = Number(req.query.limit) || 40;
    res.json(await rampService.listLibrary(req, limit));
  }),

  mmsIn: asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as InboundMmsRequest;
    if (!body || typeof body !== "object") {
      throw new HttpError(400, "Expected JSON object");
    }
    try {
      res.json(await rampService.ingestInboundMms(req, body));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "mms-in failed";
      if (msg.includes("Unknown RAMP") || msg.includes("required")) {
        throw new HttpError(400, msg);
      }
      throw new HttpError(500, msg);
    }
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

  parkPick: asyncHandler(async (req: Request, res: Response) => {
    const token = String(req.params.token || "").trim();
    if (!token) throw new HttpError(400, "token required");
    const body = (req.body && typeof req.body === "object" ? req.body : {}) as ParkPickRequest;
    try {
      res.json(
        await rampService.parkPick(
          token,
          Array.isArray(body.mediaUrls) ? body.mediaUrls : [],
          typeof body.phone === "string" ? body.phone : undefined,
        ),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "park-pick failed";
      if (msg.includes("Unknown RAMP") || msg.includes("required")) {
        throw new HttpError(400, msg);
      }
      throw new HttpError(500, msg);
    }
  }),

  listCandidates: asyncHandler(async (req: Request, res: Response) => {
    const token = String(req.params.token || "").trim();
    if (!token) throw new HttpError(400, "token required");
    res.json(await rampService.listCandidates(token));
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
      postStyle?: string;
      postType?: string;
      backgroundPosterUrl?: string;
      selfieUrl?: string;
      mode?: "deterministic" | "ai";
    };
    try {
      res.json(
        await rampService.regenerate(req, token, {
          note: typeof body.note === "string" ? body.note : undefined,
          visualDirection:
            typeof body.visualDirection === "string" ? body.visualDirection : undefined,
          imageEdit: typeof body.imageEdit === "string" ? body.imageEdit : undefined,
          postStyle: typeof body.postStyle === "string" ? body.postStyle : undefined,
          postType: typeof body.postType === "string" ? body.postType : undefined,
          backgroundPosterUrl:
            typeof body.backgroundPosterUrl === "string" ? body.backgroundPosterUrl : undefined,
          selfieUrl: typeof body.selfieUrl === "string" ? body.selfieUrl : undefined,
          mode: body.mode === "ai" || body.mode === "deterministic" ? body.mode : undefined,
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

  patchDraft: asyncHandler(async (req: Request, res: Response) => {
    const token = String(req.params.token || "").trim();
    if (!token) throw new HttpError(400, "token required");
    const body = req.body as PatchRampDraftRequest;
    if (!body || typeof body !== "object") {
      throw new HttpError(400, "Expected JSON object");
    }
    try {
      res.json(await rampService.patchDraft(req, token, body));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "patch-draft failed";
      if (msg.includes("Unknown RAMP") || msg.includes("No draft")) {
        throw new HttpError(400, msg);
      }
      throw new HttpError(500, msg);
    }
  }),

  composite: asyncHandler(async (req: Request, res: Response) => {
    const token = String(req.params.token || "").trim();
    if (!token) throw new HttpError(400, "token required");
    const body = (req.body && typeof req.body === "object" ? req.body : {}) as CompositeRampRequest;
    try {
      res.json(await rampService.composite(req, token, body));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "composite failed";
      if (msg.includes("Unknown RAMP") || msg.includes("No source") || msg.includes("No background")) {
        throw new HttpError(400, msg);
      }
      throw new HttpError(500, msg);
    }
  }),

  listBackgrounds: asyncHandler(async (req: Request, res: Response) => {
    const brandSlug =
      typeof req.query.brandSlug === "string" ? req.query.brandSlug : undefined;
    res.json(await rampService.listBackgrounds(req, brandSlug));
  }),

  saveBackground: asyncHandler(async (req: Request, res: Response) => {
    const body = (req.body && typeof req.body === "object" ? req.body : {}) as {
      brandSlug?: string;
      url?: string;
      label?: string;
      setAsDefault?: boolean;
    };
    try {
      res.json(await rampService.saveBackground(req, body));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "save-background failed";
      if (msg.includes("required")) {
        throw new HttpError(400, msg);
      }
      throw new HttpError(500, msg);
    }
  }),

  updateRecipient: asyncHandler(async (req: Request, res: Response) => {
    const token = String(req.params.token || "").trim();
    if (!token) throw new HttpError(400, "token required");
    const body = req.body as UpdateRampRecipientRequest;
    if (!body || typeof body !== "object") {
      throw new HttpError(400, "Expected JSON object");
    }
    try {
      res.json(
        await rampService.updateRecipient(req, token, {
          recipientPhone:
            typeof body.recipientPhone === "string" ? body.recipientPhone : undefined,
          recipientName:
            typeof body.recipientName === "string" ? body.recipientName : undefined,
        }),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "update-recipient failed";
      if (msg.includes("Unknown RAMP") || msg.includes("phone number")) {
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

  dismissFromQueue: asyncHandler(async (req: Request, res: Response) => {
    const token = String(req.params.token || "").trim();
    if (!token) throw new HttpError(400, "token required");
    try {
      res.json(await rampService.dismissFromQueue(token));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "dismiss-queue failed";
      if (msg.includes("Unknown RAMP") || msg.includes("token")) {
        throw new HttpError(404, msg);
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
