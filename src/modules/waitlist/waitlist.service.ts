import { getPrisma } from "../../lib/prisma.js";

export type WaitlistStatus = "open" | "booked" | "dismissed";

export type WaitlistDto = {
  id: string;
  salonId: string;
  clientName: string;
  clientPhone: string;
  serviceId: string | null;
  staffId: string | null;
  preferredDates: string[];
  preferredWindow: string | null;
  notes: string;
  status: WaitlistStatus;
  createdAt: string;
  updatedAt: string;
};

function asDates(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d),
  );
}

function toDto(row: {
  id: string;
  salonId: string;
  clientName: string;
  clientPhone: string;
  serviceId: string | null;
  staffId: string | null;
  preferredDates: unknown;
  preferredWindow: string | null;
  notes: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): WaitlistDto {
  return {
    id: row.id,
    salonId: row.salonId,
    clientName: row.clientName,
    clientPhone: row.clientPhone,
    serviceId: row.serviceId,
    staffId: row.staffId,
    preferredDates: asDates(row.preferredDates),
    preferredWindow: row.preferredWindow,
    notes: row.notes,
    status: (row.status as WaitlistStatus) || "open",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const waitlistService = {
  create: async (
    salonId: string,
    input: {
      clientName: string;
      clientPhone: string;
      serviceId?: string | null;
      staffId?: string | null;
      preferredDates?: string[];
      preferredWindow?: string | null;
      notes?: string;
    },
  ) => {
    const prisma = getPrisma();
    if (!prisma) throw new Error("DATABASE_URL not configured");
    const row = await prisma.salonxWaitlistEntry.create({
      data: {
        salonId,
        clientName: input.clientName.trim(),
        clientPhone: input.clientPhone.trim(),
        serviceId: input.serviceId?.trim() || null,
        staffId: input.staffId?.trim() || null,
        preferredDates: asDates(input.preferredDates || []),
        preferredWindow: input.preferredWindow?.trim() || null,
        notes: (input.notes || "").trim(),
        status: "open",
      },
    });
    return toDto(row);
  },

  list: async (salonId: string, status?: string) => {
    const prisma = getPrisma();
    if (!prisma) return [];
    const rows = await prisma.salonxWaitlistEntry.findMany({
      where: {
        salonId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.map(toDto);
  },

  patchStatus: async (
    salonId: string,
    id: string,
    status: WaitlistStatus,
  ) => {
    const prisma = getPrisma();
    if (!prisma) throw new Error("DATABASE_URL not configured");
    const existing = await prisma.salonxWaitlistEntry.findFirst({
      where: { id, salonId },
    });
    if (!existing) {
      const err = new Error("Not found") as Error & { status: number };
      err.status = 404;
      throw err;
    }
    const row = await prisma.salonxWaitlistEntry.update({
      where: { id },
      data: { status },
    });
    return toDto(row);
  },
};
