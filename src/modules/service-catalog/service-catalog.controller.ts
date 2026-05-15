import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { HttpError } from "../../middleware/error.middleware.js";
import { JsonRowConflictError } from "../../lib/json-row-store.js";
import { serviceCatalogService } from "./service-catalog.service.js";
import { emitServiceCatalogUpdated } from "../../realtime/io.js";

export const serviceCatalogController = {
  get: asyncHandler(async (_req: Request, res: Response) => {
    res.json(await serviceCatalogService.get());
  }),

  put: asyncHandler(async (req: Request, res: Response) => {
    const body = req.body;
    if (!body || typeof body !== "object") {
      throw new HttpError(400, "Expected JSON object");
    }
    const b = body as Record<string, unknown>;
    try {
      const next = await serviceCatalogService.put(
        b.serviceCatalog,
        typeof b.expectedUpdatedAt === "string" ? b.expectedUpdatedAt : null,
      );
      emitServiceCatalogUpdated(next);
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
