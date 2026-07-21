import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { HttpError } from "../../middleware/error.middleware.js";
import { getPrisma } from "../../lib/prisma.js";
import { prismaUnavailableResponse } from "../../lib/appointments-api.js";
import type { AuthedRequest } from "../../middleware/auth.middleware.js";
import { LEGACY_SALON_ID } from "../../lib/tenant.js";
import { micrositeService } from "../microsite/microsite.service.js";
import { waitlistService, type WaitlistStatus } from "./waitlist.service.js";

function salonIdOf(req: AuthedRequest) {
  return req.salonId || LEGACY_SALON_ID;
}

export const waitlistController = {
  /** Public: join waitlist for a salon slug. */
  joinPublic: asyncHandler(async (req: Request, res: Response) => {
    if (!getPrisma()) {
      const u = prismaUnavailableResponse();
      res.status(u.status).json(u.body);
      return;
    }
    const slug = String(req.params.slug || "");
    const salon = await micrositeService.getBySlug(slug);
    if (!salon || !salon.micrositeEnabled) {
      throw new HttpError(404, "Salon not found");
    }
    const body = (req.body || {}) as Record<string, unknown>;
    const clientName =
      typeof body.clientName === "string" ? body.clientName.trim() : "";
    const clientPhone =
      typeof body.clientPhone === "string" ? body.clientPhone.trim() : "";
    if (!clientName) throw new HttpError(400, "clientName is required");
    if (!clientPhone) throw new HttpError(400, "clientPhone is required");

    const entry = await waitlistService.create(salon.id, {
      clientName,
      clientPhone,
      serviceId:
        typeof body.serviceId === "string" ? body.serviceId : null,
      staffId: typeof body.staffId === "string" ? body.staffId : null,
      preferredDates: Array.isArray(body.preferredDates)
        ? (body.preferredDates as string[])
        : [],
      preferredWindow:
        typeof body.preferredWindow === "string"
          ? body.preferredWindow
          : null,
      notes: typeof body.notes === "string" ? body.notes : "",
    });
    res.status(201).json({ entry });
  }),

  list: asyncHandler(async (req: AuthedRequest, res: Response) => {
    const status =
      typeof req.query.status === "string" ? req.query.status : undefined;
    const entries = await waitlistService.list(salonIdOf(req), status);
    res.json({ entries });
  }),

  patch: asyncHandler(async (req: AuthedRequest, res: Response) => {
    const id = String(req.params.id || "").trim();
    if (!id) throw new HttpError(400, "id required");
    const body = (req.body || {}) as Record<string, unknown>;
    const status = String(body.status || "").toLowerCase();
    if (status !== "open" && status !== "booked" && status !== "dismissed") {
      throw new HttpError(400, "status must be open|booked|dismissed");
    }
    try {
      const entry = await waitlistService.patchStatus(
        salonIdOf(req),
        id,
        status as WaitlistStatus,
      );
      res.json({ entry });
    } catch (e) {
      const st = (e as { status?: number })?.status;
      if (st === 404) throw new HttpError(404, "Not found");
      throw e;
    }
  }),
};
