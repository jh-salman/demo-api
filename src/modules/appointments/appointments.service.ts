import { getPrismaOrNull, toDto } from "../../lib/appointments-api.js";
import {
  isTransientPrismaDbError,
  notePrismaDbFailure,
  shouldSkipPrismaDb,
} from "../../lib/prisma-resilience.js";
import { LEGACY_SALON_ID } from "../../lib/tenant.js";
import type { CreateAppointmentInput } from "./appointments.types.js";

async function withAppointmentsDb<T>(
  fn: () => Promise<T>,
): Promise<T | null> {
  const prisma = getPrismaOrNull();
  if (!prisma || shouldSkipPrismaDb()) return null;
  try {
    return await fn();
  } catch (e) {
    if (isTransientPrismaDbError(e)) {
      notePrismaDbFailure(e);
    }
    return null;
  }
}

export const appointmentsService = {
  async listOverlapping(
    from: Date,
    to: Date,
    limit = 2000,
    salonId: string = LEGACY_SALON_ID,
  ) {
    const tenantId = salonId || LEGACY_SALON_ID;
    return withAppointmentsDb(async () => {
      const prisma = getPrismaOrNull();
      if (!prisma) return null;
      const take = Math.min(Math.max(limit, 1), 5000);
      const rows = await prisma.salonxAppointment.findMany({
        where: {
          salonId: tenantId,
          AND: [{ startAt: { lt: to } }, { endAt: { gt: from } }],
        },
        orderBy: { startAt: "asc" },
        take,
      });
      return rows.map(toDto);
    });
  },

  async create(
    input: CreateAppointmentInput,
    salonId: string = LEGACY_SALON_ID,
  ) {
    const tenantId = salonId || LEGACY_SALON_ID;
    return withAppointmentsDb(async () => {
      const prisma = getPrismaOrNull();
      if (!prisma) return null;
      const row = await prisma.salonxAppointment.create({
        data: {
          salonId: tenantId,
          clientName: input.clientName,
          clientPhone: input.clientPhone ?? null,
          service: input.service,
          startAt: input.start,
          endAt: input.end,
          color: input.color,
          price: input.price,
          notes: input.notes,
          seriesId: input.seriesId,
          staffId: input.staffId,
        },
      });
      return toDto(row);
    });
  },

  async getById(id: string, salonId?: string) {
    const prisma = getPrismaOrNull();
    if (!prisma || shouldSkipPrismaDb()) return undefined;
    try {
      const row = await prisma.salonxAppointment.findUnique({ where: { id } });
      if (!row) return null;
      if (salonId && row.salonId !== salonId) return null;
      return toDto(row);
    } catch (e) {
      if (isTransientPrismaDbError(e)) notePrismaDbFailure(e);
      return undefined;
    }
  },

  async update(
    id: string,
    data: {
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
    },
    salonId?: string,
  ) {
    const prisma = getPrismaOrNull();
    if (!prisma || shouldSkipPrismaDb()) return null;
    try {
      if (salonId) {
        const existing = await prisma.salonxAppointment.findUnique({
          where: { id },
        });
        if (!existing || existing.salonId !== salonId) return undefined;
      }
      const row = await prisma.salonxAppointment.update({
        where: { id },
        data,
      });
      return toDto(row);
    } catch (e) {
      if (isTransientPrismaDbError(e)) notePrismaDbFailure(e);
      return undefined;
    }
  },

  async delete(id: string, salonId?: string) {
    const prisma = getPrismaOrNull();
    if (!prisma || shouldSkipPrismaDb()) return null;
    try {
      if (salonId) {
        const existing = await prisma.salonxAppointment.findUnique({
          where: { id },
        });
        if (!existing || existing.salonId !== salonId) return false;
      }
      await prisma.salonxAppointment.delete({ where: { id } });
      return true;
    } catch (e) {
      if (isTransientPrismaDbError(e)) notePrismaDbFailure(e);
      return false;
    }
  },

  /**
   * Upcoming appointments that carry an unreviewed client reference image.
   * Powers the stylist login popup (#11). Optionally filters by staffId.
   */
  async pendingReferenceReviews(
    salonId: string = LEGACY_SALON_ID,
    staffId?: string | null,
  ) {
    const tenantId = salonId || LEGACY_SALON_ID;
    return withAppointmentsDb(async () => {
      const prisma = getPrismaOrNull();
      if (!prisma) return null;
      const rows = await prisma.salonxAppointment.findMany({
        where: {
          salonId: tenantId,
          referenceImageUrl: { not: null },
          referenceImageReviewedAt: null,
          endAt: { gte: new Date() },
          ...(staffId ? { staffId } : {}),
        },
        orderBy: { startAt: "asc" },
        take: 50,
      });
      return rows.map(toDto);
    });
  },
};
