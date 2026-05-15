import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { HttpError } from "../../middleware/error.middleware.js";
import { calendarToolbarService } from "./calendar-toolbar.service.js";
import { emitCalendarToolbarUpdated } from "../../realtime/io.js";

export const calendarToolbarController = {
  get: asyncHandler(async (_req: Request, res: Response) => {
    const body = await calendarToolbarService.get();
    res.json(body);
  }),

  put: asyncHandler(async (req: Request, res: Response) => {
    const body = req.body;
    if (!body || typeof body !== "object") {
      throw new HttpError(400, "Expected JSON object");
    }
    const b = body as Record<string, unknown>;
    try {
      const next = await calendarToolbarService.put(b.parkedFromDrag, b.toolbarEvents);
      emitCalendarToolbarUpdated({
        stored: next.stored,
        parkedFromDrag: next.parkedFromDrag,
        toolbarEvents: next.toolbarEvents,
        ...(next.stored && "updatedAt" in next ? { updatedAt: next.updatedAt } : {}),
      });
      res.json(next);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      if (msg.includes("DATABASE_URL")) {
        throw new HttpError(503, "Database not configured");
      }
      throw new HttpError(500, msg);
    }
  }),
};
