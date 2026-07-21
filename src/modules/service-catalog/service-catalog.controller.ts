import type { Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { HttpError } from "../../middleware/error.middleware.js";
import { JsonRowConflictError } from "../../lib/json-row-store.js";
import { LEGACY_SALON_ID } from "../../lib/tenant.js";
import type { AuthedRequest } from "../../middleware/auth.middleware.js";
import { serviceCatalogService } from "./service-catalog.service.js";
import { emitServiceCatalogUpdated } from "../../realtime/io.js";
import { createCatalogCache } from "../../lib/catalog-cache.js";

const serviceCache = createCatalogCache("service:v2");

function salonIdOf(req: AuthedRequest) {
  return req.salonId || LEGACY_SALON_ID;
}

export const serviceCatalogController = {
  get: asyncHandler(async (req: AuthedRequest, res: Response) => {
    const salonId = salonIdOf(req);
    res.json(
      await serviceCache.cachedGet(salonId, () =>
        serviceCatalogService.get(salonId),
      ),
    );
  }),

  put: asyncHandler(async (req: AuthedRequest, res: Response) => {
    const salonId = salonIdOf(req);
    const body = req.body;
    if (!body || typeof body !== "object") {
      throw new HttpError(400, "Expected JSON object");
    }
    const b = body as Record<string, unknown>;
    try {
      const next = await serviceCatalogService.put(
        b.serviceCatalog,
        typeof b.expectedUpdatedAt === "string" ? b.expectedUpdatedAt : null,
        salonId,
      );
      await serviceCache.invalidate(salonId);
      emitServiceCatalogUpdated(salonId, next);
      res.json(next);
    } catch (e) {
      if (e instanceof JsonRowConflictError) {
        res.status(409).json({
          error: e.message,
          ...e.current,
          serviceCatalog: e.current.items,
        });
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
