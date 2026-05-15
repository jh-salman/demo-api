import type { SalonxAppointment } from "@prisma/client";
import { getPrisma } from "./prisma.js";

export type AppointmentDto = {
  id: string;
  clientName: string;
  service: string;
  start: string;
  end: string;
  color: string;
  price: number;
  notes: string;
  seriesId: string | null;
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
    service: row.service,
    start: row.startAt.toISOString(),
    end: row.endAt.toISOString(),
    color: row.color,
    price: row.price,
    notes: row.notes,
    seriesId: row.seriesId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function getPrismaOrNull() {
  return getPrisma();
}
