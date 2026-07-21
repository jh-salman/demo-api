import type { Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { HttpError } from "../../middleware/error.middleware.js";
import { JsonRowConflictError } from "../../lib/json-row-store.js";
import { LEGACY_SALON_ID } from "../../lib/tenant.js";
import type { AuthedRequest } from "../../middleware/auth.middleware.js";
import { calendarToolbarService } from "./calendar-toolbar.service.js";
import { emitCalendarToolbarUpdated } from "../../realtime/io.js";

function salonIdOf(req: AuthedRequest) {
  return req.salonId || LEGACY_SALON_ID;
}

export const calendarToolbarController = {
  get: asyncHandler(async (req: AuthedRequest, res: Response) => {
    const body = await calendarToolbarService.get(salonIdOf(req));
    res.json(body);
  }),

  put: asyncHandler(async (req: AuthedRequest, res: Response) => {
    const salonId = salonIdOf(req);
    const body = req.body;
    if (!body || typeof body !== "object") {
      throw new HttpError(400, "Expected JSON object");
    }
    const b = body as Record<string, unknown>;
    try {
      const next = await calendarToolbarService.put(
        b.parkedFromDrag,
        b.toolbarEvents,
        typeof b.expectedUpdatedAt === "string" ? b.expectedUpdatedAt : null,
        salonId,
      );
      emitCalendarToolbarUpdated(salonId, {
        stored: next.stored,
        parkedFromDrag: next.parkedFromDrag,
        toolbarEvents: next.toolbarEvents,
        ...(next.stored && "updatedAt" in next ? { updatedAt: next.updatedAt } : {}),
      });
      res.json(next);
    } catch (e) {
      if (e instanceof JsonRowConflictError) {
        const current = await calendarToolbarService.get(salonId);
        res.status(409).json({ error: e.message, ...current });
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
