import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { HttpError } from "../../middleware/error.middleware.js";
import type { AuthedRequest } from "../../middleware/auth.middleware.js";
import { prismaUnavailableResponse } from "../../lib/appointments-api.js";
import { LEGACY_SALON_ID } from "../../lib/tenant.js";
import {
  emitAppointmentCreated,
  emitAppointmentDeleted,
  emitAppointmentUpdated,
} from "../../realtime/io.js";
import { triggerGhostNotesBrief } from "../../lib/ghost-notes-trigger.js";
import { archiveVisitToConsultation } from "../../lib/visit-complete.js";
import { upsertClientByPhone } from "../../lib/client-upsert.js";
import {
  listClientMessages,
  sendClientMessage,
} from "../../lib/client-message.js";
import { appointmentsService } from "./appointments.service.js";
import { normalizeClientKey } from "../client-consultation/client-consultation.service.js";
import {
  assertCanMutateAppointment,
  assertCanReadAppointment,
  assertPatchStaffId,
  filterAppointmentsForViewer,
  requireViewerContext,
  resolveCreateStaffId,
} from "../../lib/appointment-auth.js";

function salonIdOf(req: AuthedRequest) {
  return req.salonId || LEGACY_SALON_ID;
}

function parseRange(
  fromRaw: string | undefined,
  toRaw: string | undefined,
): { from: Date; to: Date } | { error: string } {
  if (fromRaw && toRaw) {
    const from = new Date(fromRaw);
    const to = new Date(toRaw);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return { error: "Invalid from or to (use ISO-8601 strings)" };
    }
    if (from.getTime() >= to.getTime()) {
      return { error: "from must be before to" };
    }
    return { from, to };
  }
  const to = new Date();
  const from = new Date(to.getTime() - 365 * 24 * 60 * 60 * 1000);
  return { from, to };
}

function parseCreateBody(body: Request["body"]): {
  clientName: string;
  clientPhone: string | null;
  service: string;
  start: Date;
  end: Date;
  color: string;
  price: number;
  notes: string;
  seriesId: string | null;
  staffId: string | null;
} {
  if (!body || typeof body !== "object") {
    throw new HttpError(400, "Expected JSON object");
  }
  const b = body as Record<string, unknown>;
  const clientName = typeof b.clientName === "string" ? b.clientName.trim() : "";
  if (!clientName) {
    throw new HttpError(400, "clientName is required");
  }
  const clientPhone =
    typeof b.clientPhone === "string" && b.clientPhone.trim()
      ? b.clientPhone.trim()
      : null;
  const start = typeof b.start === "string" ? new Date(b.start) : null;
  const end = typeof b.end === "string" ? new Date(b.end) : null;
  if (!start || Number.isNaN(start.getTime()) || !end || Number.isNaN(end.getTime())) {
    throw new HttpError(400, "start and end are required ISO date strings");
  }
  if (end.getTime() <= start.getTime()) {
    throw new HttpError(400, "end must be after start");
  }

  const service = typeof b.service === "string" ? b.service : "";
  const color =
    typeof b.color === "string" && b.color.trim() ? b.color.trim() : "#3b82f6";
  const price =
    typeof b.price === "number" && Number.isFinite(b.price)
      ? b.price
      : typeof b.price === "string"
        ? Number.parseFloat(b.price) || 0
        : 0;
  const notes =
    typeof b.notes === "string" ? b.notes.trim().slice(0, 4000) : "";
  const seriesId =
    typeof b.seriesId === "string" && b.seriesId.trim() ? b.seriesId.trim() : null;
  const staffId =
    typeof b.staffId === "string" && b.staffId.trim() ? b.staffId.trim() : null;

  return { clientName, clientPhone, service, start, end, color, price, notes, seriesId, staffId };
}

function parsePatchBody(body: Request["body"]): {
  clientName?: string;
  service?: string;
  startAt?: Date;
  endAt?: Date;
  color?: string;
  price?: number;
  notes?: string;
  seriesId?: string | null;
  staffId?: string | null;
} {
  if (!body || typeof body !== "object") {
    throw new HttpError(400, "Expected JSON object");
  }
  const b = body as Record<string, unknown>;
  const data: {
    clientName?: string;
    service?: string;
    startAt?: Date;
    endAt?: Date;
    color?: string;
    price?: number;
    notes?: string;
    seriesId?: string | null;
    staffId?: string | null;
    referenceImageUrl?: string | null;
    referenceImageReviewedAt?: Date | null;
  } = {};

  if (typeof b.clientName === "string") {
    const t = b.clientName.trim();
    if (!t) throw new HttpError(400, "clientName cannot be empty");
    data.clientName = t;
  }
  if (typeof b.service === "string") data.service = b.service;
  if (typeof b.start === "string") {
    const d = new Date(b.start);
    if (Number.isNaN(d.getTime())) throw new HttpError(400, "Invalid start");
    data.startAt = d;
  }
  if (typeof b.end === "string") {
    const d = new Date(b.end);
    if (Number.isNaN(d.getTime())) throw new HttpError(400, "Invalid end");
    data.endAt = d;
  }
  if (typeof b.color === "string") data.color = b.color.trim() || "#3b82f6";
  if (typeof b.price === "number" && Number.isFinite(b.price)) data.price = b.price;
  if (typeof b.price === "string" && b.price.trim()) {
    const n = Number.parseFloat(b.price);
    if (Number.isFinite(n)) data.price = n;
  }
  if (typeof b.notes === "string") data.notes = b.notes.trim().slice(0, 4000);
  if (b.seriesId === null) data.seriesId = null;
  else if (typeof b.seriesId === "string") data.seriesId = b.seriesId.trim() || null;
  if (b.staffId === null) data.staffId = null;
  else if (typeof b.staffId === "string") data.staffId = b.staffId.trim() || null;
  if (b.referenceImageUrl === null) data.referenceImageUrl = null;
  else if (typeof b.referenceImageUrl === "string") {
    data.referenceImageUrl = b.referenceImageUrl.trim() || null;
  }
  if (b.referenceImageReviewedAt === null) data.referenceImageReviewedAt = null;
  else if (b.referenceImageReviewedAt === true || b.markReferenceReviewed === true) {
    data.referenceImageReviewedAt = new Date();
  } else if (typeof b.referenceImageReviewedAt === "string") {
    const d = new Date(b.referenceImageReviewedAt);
    if (!Number.isNaN(d.getTime())) data.referenceImageReviewedAt = d;
  }

  if (Object.keys(data).length === 0) {
    throw new HttpError(400, "No fields to update");
  }
  return data;
}

export const appointmentsController = {
  list: asyncHandler(async (req: AuthedRequest, res: Response) => {
    const ctx = await requireViewerContext(req);
    const range = parseRange(
      typeof req.query.from === "string" ? req.query.from : undefined,
      typeof req.query.to === "string" ? req.query.to : undefined,
    );
    if ("error" in range) throw new HttpError(400, range.error);
    const limitRaw = typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : 2000;
    const limit = Number.isFinite(limitRaw) ? limitRaw : 2000;
    const list = await appointmentsService.listOverlapping(
      range.from,
      range.to,
      limit,
      salonIdOf(req),
    );
    if (list === null) {
      const u = prismaUnavailableResponse();
      res.status(u.status).json(u.body);
      return;
    }
    res.json({
      appointments: filterAppointmentsForViewer(list, ctx),
    });
  }),

  create: asyncHandler(async (req: AuthedRequest, res: Response) => {
    const ctx = await requireViewerContext(req);
    const input = parseCreateBody(req.body);
    input.staffId = resolveCreateStaffId(input.staffId, ctx);
    const salonId = salonIdOf(req);
    const appointment = await appointmentsService.create(input, salonId);
    if (appointment === null) {
      const u = prismaUnavailableResponse();
      res.status(u.status).json(u.body);
      return;
    }
    // Auto-create the client in the salon catalog (match by phone).
    if (input.clientPhone) {
      await upsertClientByPhone(salonId, {
        name: input.clientName,
        phone: input.clientPhone,
        source: "Calendar",
      });
    }
    emitAppointmentCreated(salonId, { appointment });
    triggerGhostNotesBrief({
      salonId,
      appointmentId: appointment.id,
      clientName: input.clientName,
      clientPhone: input.clientPhone,
      service: input.service,
      staffId: input.staffId,
      appointmentNotes: input.notes,
    });
    res.status(201).json({ appointment });
  }),

  getById: asyncHandler(async (req: AuthedRequest, res: Response) => {
    const ctx = await requireViewerContext(req);
    const id = req.params.id as string;
    const apt = await appointmentsService.getById(id, salonIdOf(req));
    if (apt === undefined) {
      const u = prismaUnavailableResponse();
      res.status(u.status).json(u.body);
      return;
    }
    if (apt === null) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    assertCanReadAppointment(apt, ctx);
    res.json({ appointment: apt });
  }),

  patch: asyncHandler(async (req: AuthedRequest, res: Response) => {
    const ctx = await requireViewerContext(req);
    const id = req.params.id as string;
    const salonId = salonIdOf(req);
    const existing = await appointmentsService.getById(id, salonId);
    if (existing === undefined) {
      const u = prismaUnavailableResponse();
      res.status(u.status).json(u.body);
      return;
    }
    if (existing === null) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    assertCanMutateAppointment(existing, ctx);
    const data = parsePatchBody(req.body);
    assertPatchStaffId(data.staffId, ctx);
    const appointment = await appointmentsService.update(
      id,
      data,
      salonId,
    );
    if (appointment === null) {
      const u = prismaUnavailableResponse();
      res.status(u.status).json(u.body);
      return;
    }
    if (appointment === undefined) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    emitAppointmentUpdated(salonId, { appointment });
    res.json({ appointment });
  }),

  pendingReferenceReviews: asyncHandler(
    async (req: AuthedRequest, res: Response) => {
      const ctx = await requireViewerContext(req);
      let staffId =
        typeof req.query.staffId === "string" && req.query.staffId.trim()
          ? req.query.staffId.trim()
          : null;
      if (!ctx.ownerAdmin) {
        staffId = ctx.viewerStaffId;
      }
      const list = await appointmentsService.pendingReferenceReviews(
        salonIdOf(req),
        staffId,
      );
      if (list === null) {
        const u = prismaUnavailableResponse();
        res.status(u.status).json(u.body);
        return;
      }
      res.json({ appointments: list });
    },
  ),

  listMessages: asyncHandler(async (req: AuthedRequest, res: Response) => {
    const ctx = await requireViewerContext(req);
    const appointmentId = req.params.id as string;
    const salonId = salonIdOf(req);
    const apt = await appointmentsService.getById(appointmentId, salonId);
    if (apt === undefined) {
      const u = prismaUnavailableResponse();
      res.status(u.status).json(u.body);
      return;
    }
    if (apt === null) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    assertCanReadAppointment(apt, ctx);
    const list = await listClientMessages(salonId, appointmentId);
    if (list === null) {
      const u = prismaUnavailableResponse();
      res.status(u.status).json(u.body);
      return;
    }
    res.json({ messages: list });
  }),

  sendMessage: asyncHandler(async (req: AuthedRequest, res: Response) => {
    const ctx = await requireViewerContext(req);
    const appointmentId = req.params.id as string;
    const salonId = salonIdOf(req);
    const apt = await appointmentsService.getById(appointmentId, salonId);
    if (apt === undefined) {
      const u = prismaUnavailableResponse();
      res.status(u.status).json(u.body);
      return;
    }
    if (apt === null) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    assertCanMutateAppointment(apt, ctx);
    const body =
      req.body && typeof req.body === "object"
        ? (req.body as Record<string, unknown>)
        : {};
    const text = typeof body.body === "string" ? body.body.trim() : "";
    if (!text) throw new HttpError(400, "body (message text) is required");
    const phone =
      (typeof body.clientPhone === "string" && body.clientPhone.trim()) ||
      apt.clientPhone ||
      "";
    if (!phone) {
      throw new HttpError(
        400,
        "No client phone on this appointment — pass clientPhone",
      );
    }
    const message = await sendClientMessage({
      salonId,
      appointmentId,
      clientPhone: phone,
      body: text,
    });
    if (message === null) {
      const u = prismaUnavailableResponse();
      res.status(u.status).json(u.body);
      return;
    }
    res.status(201).json({ message });
  }),

  /** Cash checkout — archive consultation visit + remove appointment from calendar. */
  complete: asyncHandler(async (req: AuthedRequest, res: Response) => {
    const ctx = await requireViewerContext(req);
    const id = req.params.id as string;
    const salonId = salonIdOf(req);
    const existing = await appointmentsService.getById(id, salonId);
    if (existing === undefined) {
      const u = prismaUnavailableResponse();
      res.status(u.status).json(u.body);
      return;
    }
    if (existing === null) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    assertCanMutateAppointment(existing, ctx);

    const consultation = await archiveVisitToConsultation(salonId, {
      id: existing.id,
      clientName: existing.clientName,
      service: existing.service,
      notes: existing.notes,
      start: existing.start,
      end: existing.end,
    });

    const ok = await appointmentsService.delete(id, salonId);
    if (ok === null) {
      const u = prismaUnavailableResponse();
      res.status(u.status).json(u.body);
      return;
    }
    if (!ok) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    emitAppointmentDeleted(salonId, { id });
    res.json({
      ok: true,
      appointmentId: id,
      clientKey: consultation?.clientKey ?? normalizeClientKey(existing.clientName),
      consultation: consultation?.record ?? null,
    });
  }),

  remove: asyncHandler(async (req: AuthedRequest, res: Response) => {
    const ctx = await requireViewerContext(req);
    const id = req.params.id as string;
    const salonId = salonIdOf(req);
    const existing = await appointmentsService.getById(id, salonId);
    if (existing === undefined) {
      const u = prismaUnavailableResponse();
      res.status(u.status).json(u.body);
      return;
    }
    if (existing === null) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    assertCanMutateAppointment(existing, ctx);
    const ok = await appointmentsService.delete(id, salonId);
    if (ok === null) {
      const u = prismaUnavailableResponse();
      res.status(u.status).json(u.body);
      return;
    }
    if (!ok) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    emitAppointmentDeleted(salonId, { id });
    res.status(204).end();
  }),
};
