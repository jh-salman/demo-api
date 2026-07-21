import type { Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { HttpError } from "../../middleware/error.middleware.js";
import { JsonRowConflictError } from "../../lib/json-row-store.js";
import { LEGACY_SALON_ID } from "../../lib/tenant.js";
import type { AuthedRequest } from "../../middleware/auth.middleware.js";
import { cachedClientsGet, invalidateClientsCache } from "./clients.cache.js";
import { clientsService } from "./clients.service.js";
import { emitClientsCatalogUpdated } from "../../realtime/io.js";

function salonIdOf(req: AuthedRequest) {
  return req.salonId || LEGACY_SALON_ID;
}

export const clientsController = {
  get: asyncHandler(async (req: AuthedRequest, res: Response) => {
    const salonId = salonIdOf(req);
    const payload = await cachedClientsGet(salonId, () =>
      clientsService.get(salonId),
    );
    res.json(payload);
  }),

  put: asyncHandler(async (req: AuthedRequest, res: Response) => {
    const salonId = salonIdOf(req);
    const body = req.body;
    if (!body || typeof body !== "object") {
      throw new HttpError(400, "Expected JSON object");
    }
    const b = body as Record<string, unknown>;
    try {
      const next = await clientsService.put(
        b.clients,
        typeof b.expectedUpdatedAt === "string" ? b.expectedUpdatedAt : null,
        salonId,
      );
      await invalidateClientsCache(salonId);
      emitClientsCatalogUpdated(salonId, next);
      res.json(next);
    } catch (e) {
      if (e instanceof JsonRowConflictError) {
        res.status(409).json({ error: e.message, ...e.current, clients: e.current.items });
        return;
      }
      const msg = e instanceof Error ? e.message : "Save failed";
      if (msg.includes("DATABASE_URL")) {
        throw new HttpError(503, "Database not configured");
      }
      throw new HttpError(500, msg);
    }
  }),
};
