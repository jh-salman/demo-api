import type { Request, Response } from "express";
import { env } from "../../config/env.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { HttpError } from "../../middleware/error.middleware.js";
import { emitRampPostUpdated } from "../../realtime/io.js";
import { rampGenerateService } from "./ramp-generate.service.js";
import { rampService, type RampPostInput } from "./ramp-runtime.service.js";

function handleDbError(err: unknown): never {
  if (err instanceof HttpError) throw err;
  if (err instanceof Error && err.message === "DATABASE_URL not configured") {
    throw new HttpError(503, "Database not configured");
  }
  throw err;
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const strList = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined;

/** Map request body → service input (only known fields). */
function readBody(body: unknown): Partial<RampPostInput> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  return {
    clientName: str(b.clientName),
    clientId: b.clientId === null ? null : str(b.clientId),
    clientSub: b.clientSub === null ? null : str(b.clientSub),
    clientEmoji: str(b.clientEmoji),
    stylistId: b.stylistId === null ? null : str(b.stylistId),
    source: str(b.source),
    status: str(b.status),
    capturedImages: strList(b.capturedImages),
    generatedImages: strList(b.generatedImages),
    heroImage: b.heroImage === null ? null : str(b.heroImage),
    caption: str(b.caption),
    type: str(b.type),
    tags: Array.isArray(b.tags) ? b.tags : undefined,
    links: Array.isArray(b.links) ? b.links : undefined,
    backgroundId: str(b.backgroundId),
    genState: str(b.genState),
    shipMode: b.shipMode === null ? null : str(b.shipMode),
    shippedAt: b.shippedAt === null ? null : str(b.shippedAt),
  };
}

export const rampRuntimeController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    try {
      const posts = await rampService.list(str(req.query.status));
      res.json({ posts });
    } catch (e) {
      handleDbError(e);
    }
  }),

  get: asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id || "").trim();
    if (!id) throw new HttpError(400, "id is required");
    try {
      const post = await rampService.get(id);
      if (!post) throw new HttpError(404, "Post not found");
      res.json({ post });
    } catch (e) {
      handleDbError(e);
    }
  }),

  /** Public share — generated image only (no auth). */
  publicGet: asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id || "").trim();
    if (!id) throw new HttpError(400, "id is required");
    try {
      const post = await rampService.getPublic(id);
      if (!post?.generatedImage) {
        throw new HttpError(404, "Generated image not found");
      }
      res.json({ post });
    } catch (e) {
      handleDbError(e);
    }
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const input = readBody(req.body);
    if (!input.clientName) throw new HttpError(400, "clientName is required");
    try {
      const post = await rampService.create(input as RampPostInput);
      emitRampPostUpdated({ post });
      res.status(201).json({ post });
    } catch (e) {
      handleDbError(e);
    }
  }),

  patch: asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id || "").trim();
    if (!id) throw new HttpError(400, "id is required");
    try {
      const post = await rampService.update(id, readBody(req.body));
      emitRampPostUpdated({ post });
      res.json({ post });
    } catch (e) {
      handleDbError(e);
    }
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id || "").trim();
    if (!id) throw new HttpError(400, "id is required");
    try {
      await rampService.remove(id);
      emitRampPostUpdated({ post: { id, status: "dismissed" } });
      res.json({ ok: true });
    } catch (e) {
      handleDbError(e);
    }
  }),

  /** Start async image generation — returns 202 immediately (Render-safe). */
  generate: asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id || "").trim();
    if (!id) throw new HttpError(400, "id is required");

    if (!env.OPENAI_API_KEY) {
      throw new HttpError(503, "OPENAI_API_KEY is not configured");
    }

    try {
      const existing = await rampService.get(id);
      if (!existing) throw new HttpError(404, "Post not found");

      if (existing.genState === "generating") {
        res.status(202).json({ post: existing });
        return;
      }

      const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<
        string,
        unknown
      >;
      const caption =
        typeof body.caption === "string" && body.caption.trim()
          ? body.caption.trim()
          : String(existing.caption || "").trim();

      if (!caption) {
        throw new HttpError(400, "Enter a prompt first.");
      }

      const isStation = existing.source === "station";
      if (!existing.heroImage && !isStation) {
        throw new HttpError(400, "No photo on this post — capture one first.");
      }

      const post = await rampService.update(id, {
        caption,
        genState: "generating",
        status: "building",
      });
      emitRampPostUpdated({ post });
      res.status(202).json({ post });

      rampGenerateService.runInBackground(id);
    } catch (e) {
      handleDbError(e);
    }
  }),
};
