import type { Salon } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { getPrisma } from "../../lib/prisma.js";
import { staffService } from "../staff/staff.service.js";
import { serviceCatalogService } from "../service-catalog/service-catalog.service.js";
import {
  getTemplate,
  isValidSlug,
  normalizeSlug,
  type BookingHours,
  MICROSITE_TEMPLATES,
} from "./microsite.templates.js";
import {
  DEFAULT_MICROSITE_THEME,
  mergeMicrositeTheme,
  normalizeMicrositeTheme,
  type MicrositeTheme,
} from "./microsite.theme.js";
import { upsertClientByPhone } from "../../lib/client-upsert.js";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export type SalonPublicDto = {
  id: string;
  name: string;
  slug: string;
  organizationId: string | null;
  templateId: string;
  phone: string | null;
  timezone: string;
  primaryHex: string;
  logoUrl: string | null;
  tagline: string | null;
  about: string | null;
  theme: MicrositeTheme;
  bookingHours: BookingHours;
  micrositeEnabled: boolean;
};

function asBookingHours(value: unknown): BookingHours {
  if (!value || typeof value !== "object") return {};
  return value as BookingHours;
}

export function salonToPublic(row: Salon): SalonPublicDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    organizationId: row.organizationId ?? null,
    templateId: row.templateId,
    phone: row.phone,
    timezone: row.timezone,
    primaryHex: row.primaryHex,
    logoUrl: row.logoUrl,
    tagline: row.tagline,
    about: row.about,
    theme: normalizeMicrositeTheme(row.theme),
    bookingHours: asBookingHours(row.bookingHours),
    micrositeEnabled: row.micrositeEnabled,
  };
}

function parseHm(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function serviceDurationMinutes(item: Record<string, unknown>): number {
  const raw = item.durationMinutes ?? item.duration ?? item.minutes;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return Math.round(raw);
  if (typeof raw === "string") {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 60;
}

export const micrositeService = {
  listTemplates() {
    return MICROSITE_TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      previewLabel: t.previewLabel,
      defaults: t.defaults,
    }));
  },

  async getBySlug(slug: string) {
    const prisma = getPrisma();
    if (!prisma) return null;
    const row = await prisma.salon.findUnique({ where: { slug: normalizeSlug(slug) } });
    return row ? salonToPublic(row) : null;
  },

  async getById(id: string) {
    const prisma = getPrisma();
    if (!prisma) return null;
    const row = await prisma.salon.findUnique({ where: { id } });
    return row ? salonToPublic(row) : null;
  },

  async listSalons(organizationIds: string[]) {
    const prisma = getPrisma();
    if (!prisma) return [];
    // Never list global catalog — empty membership → empty result.
    if (!organizationIds.length) return [];
    const rows = await prisma.salon.findMany({
      where: { organizationId: { in: organizationIds } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(salonToPublic);
  },

  async createFromTemplate(input: {
    templateId: string;
    slug: string;
    name?: string;
    organizationId?: string | null;
  }) {
    const prisma = getPrisma();
    if (!prisma) throw new Error("DATABASE_URL not configured");

    const slug = normalizeSlug(input.slug);
    if (!isValidSlug(slug)) {
      const err = new Error("Invalid or reserved slug") as Error & { status: number };
      err.status = 400;
      throw err;
    }

    const template = getTemplate(input.templateId);
    if (!template) {
      const err = new Error("Unknown template") as Error & { status: number };
      err.status = 400;
      throw err;
    }

    const existing = await prisma.salon.findUnique({ where: { slug } });
    if (existing) {
      const err = new Error("Slug already taken") as Error & { status: number };
      err.status = 409;
      throw err;
    }

    if (input.organizationId) {
      const owned = await prisma.salon.findUnique({
        where: { organizationId: input.organizationId },
      });
      if (owned) {
        const err = new Error("Organization already has a salon") as Error & {
          status: number;
        };
        err.status = 409;
        throw err;
      }
    }

    const name = (input.name || slug).trim() || slug;
    const theme = normalizeMicrositeTheme(
      template.defaults.theme || DEFAULT_MICROSITE_THEME,
    );
    const row = await prisma.salon.create({
      data: {
        organizationId: input.organizationId || null,
        name,
        slug,
        templateId: template.id,
        primaryHex: template.defaults.primaryHex,
        tagline: template.defaults.tagline,
        about: template.defaults.about,
        theme: theme as Prisma.InputJsonValue,
        bookingHours: template.defaults.bookingHours as Prisma.InputJsonValue,
        micrositeEnabled: true,
      },
    });
    return salonToPublic(row);
  },

  async updateSalon(
    slug: string,
    patch: {
      name?: string;
      phone?: string | null;
      primaryHex?: string;
      logoUrl?: string | null;
      tagline?: string | null;
      about?: string | null;
      theme?: Partial<MicrositeTheme> | null;
      bookingHours?: BookingHours;
      micrositeEnabled?: boolean;
      timezone?: string;
    },
  ) {
    const prisma = getPrisma();
    if (!prisma) throw new Error("DATABASE_URL not configured");

    const key = normalizeSlug(slug);
    const existing = await prisma.salon.findUnique({ where: { slug: key } });
    if (!existing) {
      const err = new Error("Salon not found") as Error & { status: number };
      err.status = 404;
      throw err;
    }

    const data: Prisma.SalonUpdateInput = {};
    if (patch.name !== undefined) data.name = patch.name.trim() || undefined;
    if (patch.phone !== undefined) data.phone = patch.phone;
    if (patch.primaryHex !== undefined) data.primaryHex = patch.primaryHex;
    if (patch.logoUrl !== undefined) data.logoUrl = patch.logoUrl;
    if (patch.tagline !== undefined) data.tagline = patch.tagline;
    if (patch.about !== undefined) data.about = patch.about;
    if (patch.theme !== undefined && patch.theme !== null) {
      data.theme = mergeMicrositeTheme(
        existing.theme,
        patch.theme,
      ) as Prisma.InputJsonValue;
    }
    if (patch.bookingHours !== undefined) {
      data.bookingHours = patch.bookingHours as Prisma.InputJsonValue;
    }
    if (patch.micrositeEnabled !== undefined) {
      data.micrositeEnabled = patch.micrositeEnabled;
    }
    if (patch.timezone !== undefined) data.timezone = patch.timezone;

    const row = await prisma.salon.update({ where: { slug: key }, data });
    return salonToPublic(row);
  },

  async getServices(salonId?: string) {
    const { serviceCatalog } = await serviceCatalogService.get(salonId);
    return Array.isArray(serviceCatalog) ? serviceCatalog : [];
  },

  async getStaff(salonId?: string) {
    const { staff } = await staffService.get(salonId);
    return Array.isArray(staff) ? staff : [];
  },

  async availability(input: {
    salon: SalonPublicDto;
    date: string; // YYYY-MM-DD
    serviceId?: string;
    staffId?: string | null;
    slotMinutes?: number;
  }) {
    const prisma = getPrisma();
    if (!prisma) return { slots: [] as { start: string; end: string; staffId: string | null }[] };

    const day = new Date(`${input.date}T12:00:00`);
    if (Number.isNaN(day.getTime())) {
      const err = new Error("Invalid date") as Error & { status: number };
      err.status = 400;
      throw err;
    }

    const dayKey = DAY_KEYS[day.getDay()];
    const windows = input.salon.bookingHours[dayKey] || [];
    if (!windows.length) return { slots: [], date: input.date, dayKey };

    const services = (await this.getServices(input.salon.id)) as Record<
      string,
      unknown
    >[];
    const service = input.serviceId
      ? services.find((s) => String(s.id) === input.serviceId)
      : services[0];
    const duration = service ? serviceDurationMinutes(service) : 60;
    const step = input.slotMinutes && input.slotMinutes > 0 ? input.slotMinutes : 15;

    const staffList = (await this.getStaff(input.salon.id)) as {
      id?: string;
      name?: string;
    }[];
    const staffIds = input.staffId
      ? [input.staffId]
      : staffList.map((s) => s.id).filter((id): id is string => Boolean(id));

    if (!staffIds.length) {
      // Allow unassigned booking slots
      staffIds.push("__any__");
    }

    const dayStart = new Date(`${input.date}T00:00:00`);
    const dayEnd = new Date(`${input.date}T23:59:59.999`);

    const existing = await prisma.salonxAppointment.findMany({
      where: {
        salonId: input.salon.id,
        AND: [{ startAt: { lt: dayEnd } }, { endAt: { gt: dayStart } }],
      },
      select: { startAt: true, endAt: true, staffId: true },
    });

    const now = Date.now();
    const slots: { start: string; end: string; staffId: string | null }[] = [];

    for (const staffId of staffIds) {
      const sid = staffId === "__any__" ? null : staffId;
      for (const win of windows) {
        const startM = parseHm(win.start);
        const endM = parseHm(win.end);
        if (startM == null || endM == null || endM <= startM) continue;

        for (let t = startM; t + duration <= endM; t += step) {
          const start = new Date(dayStart);
          start.setHours(Math.floor(t / 60), t % 60, 0, 0);
          const end = new Date(start.getTime() + duration * 60_000);
          if (start.getTime() < now) continue;

          const overlaps = existing.some((a) => {
            if (sid && a.staffId && a.staffId !== sid) return false;
            return a.startAt < end && a.endAt > start;
          });
          if (overlaps) continue;

          slots.push({
            start: start.toISOString(),
            end: end.toISOString(),
            staffId: sid,
          });
        }
      }
    }

    slots.sort((a, b) => a.start.localeCompare(b.start));
    return { slots, date: input.date, dayKey, durationMinutes: duration };
  },

  async book(input: {
    salon: SalonPublicDto;
    clientName: string;
    clientPhone: string;
    clientEmail?: string | null;
    notes?: string | null;
    serviceId?: string;
    staffId?: string | null;
    start: Date;
    end: Date;
  }) {
    const prisma = getPrisma();
    if (!prisma) throw new Error("DATABASE_URL not configured");

    if (!input.salon.micrositeEnabled) {
      const err = new Error("Booking unavailable") as Error & { status: number };
      err.status = 403;
      throw err;
    }

    if (input.end.getTime() <= input.start.getTime()) {
      const err = new Error("end must be after start") as Error & { status: number };
      err.status = 400;
      throw err;
    }

    const services = (await this.getServices(input.salon.id)) as Record<
      string,
      unknown
    >[];
    const service = input.serviceId
      ? services.find((s) => String(s.id) === input.serviceId)
      : null;
    const serviceName =
      (service && typeof service.name === "string" && service.name) ||
      (typeof input.serviceId === "string" ? input.serviceId : "") ||
      "";
    const price =
      service && typeof service.price === "number" && Number.isFinite(service.price)
        ? service.price
        : 0;
    const color =
      (service && typeof service.color === "string" && service.color) ||
      input.salon.primaryHex ||
      "#3b82f6";

    const staffId = input.staffId?.trim() || null;

    const clientNote =
      typeof input.notes === "string" && input.notes.trim()
        ? ` · ${input.notes.trim()}`
        : "";

    const conflict = await prisma.salonxAppointment.findFirst({
      where: {
        salonId: input.salon.id,
        ...(staffId ? { staffId } : {}),
        AND: [{ startAt: { lt: input.end } }, { endAt: { gt: input.start } }],
      },
      select: { id: true },
    });
    if (conflict) {
      const err = new Error("Time slot unavailable") as Error & { status: number };
      err.status = 409;
      throw err;
    }

    const row = await prisma.salonxAppointment.create({
      data: {
        salonId: input.salon.id,
        clientName: input.clientName.trim(),
        clientPhone: input.clientPhone.trim(),
        service: serviceName,
        startAt: input.start,
        endAt: input.end,
        color,
        price,
        notes: `Booked via microsite · ${input.clientPhone.trim()}${clientNote}`,
        staffId,
      },
    });

    // Auto-create the client in the salon catalog (match by phone).
    await upsertClientByPhone(input.salon.id, {
      name: input.clientName,
      phone: input.clientPhone,
      email: input.clientEmail?.trim() || undefined,
      source: "Microsite",
    });

    return {
      id: row.id,
      clientName: row.clientName,
      clientPhone: row.clientPhone,
      service: row.service,
      start: row.startAt.toISOString(),
      end: row.endAt.toISOString(),
      staffId: row.staffId,
      salonId: row.salonId,
      color: row.color,
      price: row.price,
    };
  },
};
