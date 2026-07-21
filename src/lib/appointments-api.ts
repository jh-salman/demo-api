import type { SalonxAppointment } from "@prisma/client";
import { getPrisma } from "./prisma.js";

export type AppointmentDto = {
  id: string;
  clientName: string;
  clientPhone: string | null;
  service: string;
  start: string;
  end: string;
  color: string;
  price: number;
  notes: string;
  seriesId: string | null;
  staffId: string | null;
  salonId: string;
  referenceImageUrl: string | null;
  referenceImageReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function prismaUnavailableResponse(): { status: 503; body: { error: string } } {
  return {
    status: 503,
    body: { error: "DATABASE_URL is not configured or database is unavailable" },
  };
}

export function toDto(row: SalonxAppointment): AppointmentDto {
  return {
    id: row.id,
    clientName: row.clientName,
    clientPhone: row.clientPhone ?? null,
    service: row.service,
    start: row.startAt.toISOString(),
    end: row.endAt.toISOString(),
    color: row.color,
    price: row.price,
    notes: row.notes,
    seriesId: row.seriesId,
    staffId: row.staffId,
    salonId: row.salonId,
    referenceImageUrl: row.referenceImageUrl ?? null,
    referenceImageReviewedAt: row.referenceImageReviewedAt
      ? row.referenceImageReviewedAt.toISOString()
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function getPrismaOrNull() {
  return getPrisma();
}
