import type { Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { HttpError } from "../../middleware/error.middleware.js";
import type { AuthedRequest } from "../../middleware/auth.middleware.js";
import { JsonPayloadConflictError } from "../../lib/json-payload-store.js";
import { LEGACY_SALON_ID } from "../../lib/tenant.js";
import { appointmentVisitService } from "./appointment-visit.service.js";
import { emitAppointmentVisitUpdated } from "../../realtime/io.js";

function salonIdOf(req: AuthedRequest) {
  return req.salonId || LEGACY_SALON_ID;
}

export const appointmentVisitController = {
  get: asyncHandler(async (req: AuthedRequest, res: Response) => {
    const appointmentId = String(req.params.appointmentId || "").trim();
    if (!appointmentId) throw new HttpError(400, "appointmentId required");
    res.json(await appointmentVisitService.get(appointmentId));
  }),

  put: asyncHandler(async (req: AuthedRequest, res: Response) => {
    const appointmentId = String(req.params.appointmentId || "").trim();
    if (!appointmentId) throw new HttpError(400, "appointmentId required");
    const body = req.body;
    if (!body || typeof body !== "object") {
      throw new HttpError(400, "Expected JSON object");
    }
    const b = body as Record<string, unknown>;
    try {
      const next = await appointmentVisitService.put(
        appointmentId,
        b.visit,
        typeof b.expectedUpdatedAt === "string" ? b.expectedUpdatedAt : null,
      );
      emitAppointmentVisitUpdated(salonIdOf(req), next);
      res.json(next);
    } catch (e) {
      if (e instanceof JsonPayloadConflictError) {
        res.status(409).json({
          error: e.message,
          appointmentId,
          visit: e.current.payload,
          updatedAt: e.current.updatedAt,
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
