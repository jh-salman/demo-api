import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { HttpError } from "../../middleware/error.middleware.js";
import { prismaUnavailableResponse } from "../../lib/appointments-api.js";
import {
  emitAppointmentCreated,
  emitAppointmentDeleted,
  emitAppointmentUpdated,
} from "../../realtime/io.js";
import { appointmentsService } from "./appointments.service.js";

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

  return { clientName, service, start, end, color, price, notes, seriesId, staffId };
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

  if (Object.keys(data).length === 0) {
    throw new HttpError(400, "No fields to update");
  }
  return data;
}

export const appointmentsController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const range = parseRange(
      typeof req.query.from === "string" ? req.query.from : undefined,
      typeof req.query.to === "string" ? req.query.to : undefined,
    );
    if ("error" in range) throw new HttpError(400, range.error);
    const limitRaw = typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : 2000;
    const limit = Number.isFinite(limitRaw) ? limitRaw : 2000;
    const list = await appointmentsService.listOverlapping(range.from, range.to, limit);
    if (list === null) {
      const u = prismaUnavailableResponse();
      res.status(u.status).json(u.body);
      return;
    }
    res.json({ appointments: list });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const input = parseCreateBody(req.body);
    const appointment = await appointmentsService.create(input);
    if (appointment === null) {
      const u = prismaUnavailableResponse();
      res.status(u.status).json(u.body);
      return;
    }
    emitAppointmentCreated({ appointment });
    res.status(201).json({ appointment });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const apt = await appointmentsService.getById(id);
    if (apt === undefined) {
      const u = prismaUnavailableResponse();
      res.status(u.status).json(u.body);
      return;
    }
    if (apt === null) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ appointment: apt });
  }),

  patch: asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const data = parsePatchBody(req.body);
    const appointment = await appointmentsService.update(id, data);
    if (appointment === null) {
      const u = prismaUnavailableResponse();
      res.status(u.status).json(u.body);
      return;
    }
    if (appointment === undefined) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    emitAppointmentUpdated({ appointment });
    res.json({ appointment });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const ok = await appointmentsService.delete(id);
    if (ok === null) {
      const u = prismaUnavailableResponse();
      res.status(u.status).json(u.body);
      return;
    }
    if (!ok) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    emitAppointmentDeleted({ id });
    res.status(204).end();
  }),
};
