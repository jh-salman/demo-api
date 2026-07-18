import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { HttpError } from "../../middleware/error.middleware.js";
import { prismaUnavailableResponse } from "../../lib/appointments-api.js";
import { getPrisma } from "../../lib/prisma.js";
import { emitAppointmentCreated } from "../../realtime/io.js";
import { micrositeService } from "./microsite.service.js";
import { isValidSlug, normalizeSlug } from "./microsite.templates.js";
import type { AuthedRequest } from "../../middleware/auth.middleware.js";

function statusFromErr(e: unknown): number {
  if (e && typeof e === "object" && "status" in e) {
    const s = (e as { status?: number }).status;
    if (typeof s === "number") return s;
  }
  return 500;
}

async function requirePublicSalon(slug: string) {
  const salon = await micrositeService.getBySlug(slug);
  if (!salon) throw new HttpError(404, "Salon not found");
  if (!salon.micrositeEnabled) throw new HttpError(403, "Booking unavailable");
  return salon;
}

export const micrositeController = {
  listTemplates: asyncHandler(async (_req: Request, res: Response) => {
    res.json({ templates: micrositeService.listTemplates() });
  }),

  listSalons: asyncHandler(async (req: AuthedRequest, res: Response) => {
    if (!getPrisma()) {
      const u = prismaUnavailableResponse();
      res.status(u.status).json(u.body);
      return;
    }
    const prisma = getPrisma();
    const userId = req.authSession?.user?.id;
    if (!userId || !prisma) {
      throw new HttpError(401, "Unauthorized");
    }
    const members = await prisma.member.findMany({
      where: { userId },
      select: { organizationId: true },
    });
    const orgIds = members.map((m) => m.organizationId);
    res.json({ salons: await micrositeService.listSalons(orgIds) });
  }),

  checkSlug: asyncHandler(async (req: Request, res: Response) => {
    const slug = normalizeSlug(String(req.query.slug || ""));
    if (!isValidSlug(slug)) {
      res.json({ slug, available: false, reason: "invalid_or_reserved" });
      return;
    }
    if (!getPrisma()) {
      const u = prismaUnavailableResponse();
      res.status(u.status).json(u.body);
      return;
    }
    const existing = await micrositeService.getBySlug(slug);
    res.json({ slug, available: !existing });
  }),

  create: asyncHandler(async (req: AuthedRequest, res: Response) => {
    if (!getPrisma()) {
      const u = prismaUnavailableResponse();
      res.status(u.status).json(u.body);
      return;
    }
    const orgId = req.authSession?.session.activeOrganizationId;
    if (!orgId) {
      throw new HttpError(403, "No active organization");
    }
    const body = (req.body || {}) as Record<string, unknown>;
    const templateId =
      typeof body.templateId === "string" ? body.templateId : "sx-book-v1";
    const slug = typeof body.slug === "string" ? body.slug : "";
    const name = typeof body.name === "string" ? body.name : undefined;
    try {
      const salon = await micrositeService.createFromTemplate({
        templateId,
        slug,
        name,
        organizationId: orgId,
      });
      res.status(201).json({ salon });
    } catch (e) {
      throw new HttpError(statusFromErr(e), e instanceof Error ? e.message : "Create failed");
    }
  }),

  patchSalon: asyncHandler(async (req: AuthedRequest, res: Response) => {
    if (!getPrisma()) {
      const u = prismaUnavailableResponse();
      res.status(u.status).json(u.body);
      return;
    }
    const orgId = req.authSession?.session.activeOrganizationId;
    if (!orgId) {
      throw new HttpError(403, "No active organization");
    }
    const slug = String(req.params.slug || "");
    const existing = await micrositeService.getBySlug(slug);
    if (!existing) throw new HttpError(404, "Salon not found");
    const prisma = getPrisma()!;
    const row = await prisma.salon.findUnique({ where: { slug: normalizeSlug(slug) } });
    if (row?.organizationId && row.organizationId !== orgId) {
      throw new HttpError(403, "Not your salon");
    }
    const body = (req.body || {}) as Record<string, unknown>;
    try {
      const salon = await micrositeService.updateSalon(slug, {
        name: typeof body.name === "string" ? body.name : undefined,
        phone:
          body.phone === null
            ? null
            : typeof body.phone === "string"
              ? body.phone
              : undefined,
        primaryHex:
          typeof body.primaryHex === "string" ? body.primaryHex : undefined,
        logoUrl:
          body.logoUrl === null
            ? null
            : typeof body.logoUrl === "string"
              ? body.logoUrl
              : undefined,
        tagline:
          body.tagline === null
            ? null
            : typeof body.tagline === "string"
              ? body.tagline
              : undefined,
        about:
          body.about === null
            ? null
            : typeof body.about === "string"
              ? body.about
              : undefined,
        bookingHours:
          body.bookingHours && typeof body.bookingHours === "object"
            ? (body.bookingHours as never)
            : undefined,
        micrositeEnabled:
          typeof body.micrositeEnabled === "boolean"
            ? body.micrositeEnabled
            : undefined,
        timezone: typeof body.timezone === "string" ? body.timezone : undefined,
      });
      res.json({ salon });
    } catch (e) {
      throw new HttpError(statusFromErr(e), e instanceof Error ? e.message : "Update failed");
    }
  }),

  getPublicSalon: asyncHandler(async (req: Request, res: Response) => {
    if (!getPrisma()) {
      const u = prismaUnavailableResponse();
      res.status(u.status).json(u.body);
      return;
    }
    const salon = await requirePublicSalon(String(req.params.slug || ""));
    res.json({ salon });
  }),

  getPublicServices: asyncHandler(async (req: Request, res: Response) => {
    if (!getPrisma()) {
      const u = prismaUnavailableResponse();
      res.status(u.status).json(u.body);
      return;
    }
    await requirePublicSalon(String(req.params.slug || ""));
    const services = await micrositeService.getServices();
    res.json({ services });
  }),

  getPublicStaff: asyncHandler(async (req: Request, res: Response) => {
    if (!getPrisma()) {
      const u = prismaUnavailableResponse();
      res.status(u.status).json(u.body);
      return;
    }
    await requirePublicSalon(String(req.params.slug || ""));
    const staff = await micrositeService.getStaff();
    res.json({ staff });
  }),

  getAvailability: asyncHandler(async (req: Request, res: Response) => {
    if (!getPrisma()) {
      const u = prismaUnavailableResponse();
      res.status(u.status).json(u.body);
      return;
    }
    const salon = await requirePublicSalon(String(req.params.slug || ""));
    const date = String(req.query.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new HttpError(400, "date is required (YYYY-MM-DD)");
    }
    const serviceId =
      typeof req.query.serviceId === "string" ? req.query.serviceId : undefined;
    const staffId =
      typeof req.query.staffId === "string" && req.query.staffId.trim()
        ? req.query.staffId.trim()
        : null;
    try {
      const result = await micrositeService.availability({
        salon,
        date,
        serviceId,
        staffId,
      });
      res.json(result);
    } catch (e) {
      throw new HttpError(statusFromErr(e), e instanceof Error ? e.message : "Availability failed");
    }
  }),

  book: asyncHandler(async (req: Request, res: Response) => {
    if (!getPrisma()) {
      const u = prismaUnavailableResponse();
      res.status(u.status).json(u.body);
      return;
    }
    const salon = await requirePublicSalon(String(req.params.slug || ""));
    const body = (req.body || {}) as Record<string, unknown>;
    const clientName =
      typeof body.clientName === "string" ? body.clientName.trim() : "";
    const clientPhone =
      typeof body.clientPhone === "string" ? body.clientPhone.trim() : "";
    if (!clientName) throw new HttpError(400, "clientName is required");
    if (!clientPhone) throw new HttpError(400, "clientPhone is required");

    const start =
      typeof body.start === "string" ? new Date(body.start) : null;
    const end = typeof body.end === "string" ? new Date(body.end) : null;
    if (!start || Number.isNaN(start.getTime()) || !end || Number.isNaN(end.getTime())) {
      throw new HttpError(400, "start and end are required ISO date strings");
    }

    try {
      const appointment = await micrositeService.book({
        salon,
        clientName,
        clientPhone,
        serviceId:
          typeof body.serviceId === "string" ? body.serviceId : undefined,
        staffId:
          typeof body.staffId === "string" && body.staffId.trim()
            ? body.staffId.trim()
            : null,
        start,
        end,
      });

      // Calendar DTO shape for realtime consumers
      emitAppointmentCreated({
        appointment: {
          id: appointment.id,
          clientName: appointment.clientName,
          service: appointment.service,
          start: appointment.start,
          end: appointment.end,
          color: appointment.color,
          price: appointment.price,
          notes: `Booked via microsite · ${appointment.clientPhone}`,
          seriesId: null,
          staffId: appointment.staffId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      res.status(201).json({ appointment });
    } catch (e) {
      throw new HttpError(statusFromErr(e), e instanceof Error ? e.message : "Book failed");
    }
  }),
};
