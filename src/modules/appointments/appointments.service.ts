import { getPrismaOrNull, toDto } from "../../lib/appointments-api.js";
import type { CreateAppointmentInput } from "./appointments.types.js";

export const appointmentsService = {
  async listOverlapping(from: Date, to: Date) {
    const prisma = getPrismaOrNull();
    if (!prisma) return null;
    const rows = await prisma.salonxAppointment.findMany({
      where: {
        AND: [{ startAt: { lt: to } }, { endAt: { gt: from } }],
      },
      orderBy: { startAt: "asc" },
      take: 2000,
    });
    return rows.map(toDto);
  },

  async create(input: CreateAppointmentInput) {
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
  },

  async getById(id: string) {
    const prisma = getPrismaOrNull();
    if (!prisma) return undefined;
    const row = await prisma.salonxAppointment.findUnique({ where: { id } });
    return row ? toDto(row) : null;
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
    if (!prisma) return null;
    try {
      const row = await prisma.salonxAppointment.update({
        where: { id },
        data,
      });
      return toDto(row);
    } catch {
      return undefined;
    }
  },

  async delete(id: string) {
    const prisma = getPrismaOrNull();
    if (!prisma) return null;
    try {
      await prisma.salonxAppointment.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  },
};
