import { getPrismaOrNull, toDto } from "../../lib/appointments-api.js";
import {
  isTransientPrismaDbError,
  notePrismaDbFailure,
  shouldSkipPrismaDb,
} from "../../lib/prisma-resilience.js";
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
  async listOverlapping(from: Date, to: Date, limit = 2000) {
    return withAppointmentsDb(async () => {
      const prisma = getPrismaOrNull();
      if (!prisma) return null;
      const take = Math.min(Math.max(limit, 1), 5000);
      const rows = await prisma.salonxAppointment.findMany({
        where: {
          AND: [{ startAt: { lt: to } }, { endAt: { gt: from } }],
        },
        orderBy: { startAt: "asc" },
        take,
      });
      return rows.map(toDto);
    });
  },

  async create(input: CreateAppointmentInput) {
    return withAppointmentsDb(async () => {
      const prisma = getPrismaOrNull();
      if (!prisma) return null;
      const row = await prisma.salonxAppointment.create({
        data: {
          clientName: input.clientName,
          service: input.service,
          startAt: input.start,
          endAt: input.end,
          color: input.color,
          price: input.price,
          notes: input.notes,
          seriesId: input.seriesId,
        },
      });
      return toDto(row);
    });
  },

  async getById(id: string) {
    const prisma = getPrismaOrNull();
    if (!prisma || shouldSkipPrismaDb()) return undefined;
    try {
      const row = await prisma.salonxAppointment.findUnique({ where: { id } });
      return row ? toDto(row) : null;
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
    },
  ) {
    const prisma = getPrismaOrNull();
    if (!prisma || shouldSkipPrismaDb()) return null;
    try {
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

  async delete(id: string) {
    const prisma = getPrismaOrNull();
    if (!prisma || shouldSkipPrismaDb()) return null;
    try {
      await prisma.salonxAppointment.delete({ where: { id } });
      return true;
    } catch (e) {
      if (isTransientPrismaDbError(e)) notePrismaDbFailure(e);
      return false;
    }
  },
};
