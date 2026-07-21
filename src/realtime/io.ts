import type { Server } from "socket.io";
import { LEGACY_SALON_ID } from "../lib/tenant.js";

let io: Server | null = null;

/** Socket.IO event names — realtime mirror of REST + SSE. */
export const RealtimeEvents = {
  APPOINTMENT_CREATED: "appointment:created",
  APPOINTMENT_UPDATED: "appointment:updated",
  APPOINTMENT_DELETED: "appointment:deleted",
  /** Payload: `{ scope: 'draft' | 'published', revision, webProjectionRevision, data }` */
  CONFIG_UPDATED: "config:updated",
  CALENDAR_TOOLBAR_UPDATED: "calendar-toolbar:updated",
  CLIENTS_CATALOG_UPDATED: "clients-catalog:updated",
  SERVICE_CATALOG_UPDATED: "service-catalog:updated",
  CONSULTATION_UPDATED: "consultation:updated",
  APPOINTMENT_VISIT_UPDATED: "appointment-visit:updated",
  PRODUCT_CATALOG_UPDATED: "product-catalog:updated",
  RAMP_POST_UPDATED: "ramp:post:updated",
} as const;

export function salonRoom(salonId?: string | null): string {
  const id = (salonId || LEGACY_SALON_ID).trim() || LEGACY_SALON_ID;
  return `salon:${id}`;
}

export function setIo(server: Server) {
  io = server;
}

export function getIo(): Server | null {
  return io;
}

function emitToSalon(
  salonId: string | undefined | null,
  event: string,
  payload: unknown,
) {
  if (!io) return;
  io.to(salonRoom(salonId)).emit(event, payload);
}

export function emitAppointmentCreated(
  salonId: string | undefined | null,
  payload: { appointment: unknown },
) {
  emitToSalon(salonId, RealtimeEvents.APPOINTMENT_CREATED, payload);
}

export function emitAppointmentUpdated(
  salonId: string | undefined | null,
  payload: { appointment: unknown },
) {
  emitToSalon(salonId, RealtimeEvents.APPOINTMENT_UPDATED, payload);
}

export function emitAppointmentDeleted(
  salonId: string | undefined | null,
  payload: { id: string },
) {
  emitToSalon(salonId, RealtimeEvents.APPOINTMENT_DELETED, payload);
}

export function emitConfigUpdated(payload: {
  scope: "draft" | "published";
  revision: string;
  webProjectionRevision: string;
  data: unknown;
}) {
  io?.emit(RealtimeEvents.CONFIG_UPDATED, payload);
}

export function emitCalendarToolbarUpdated(
  salonId: string | undefined | null,
  payload: {
    stored: boolean;
    parkedFromDrag: unknown;
    toolbarEvents: unknown;
    updatedAt?: string;
  },
) {
  emitToSalon(salonId, RealtimeEvents.CALENDAR_TOOLBAR_UPDATED, payload);
}

export function emitClientsCatalogUpdated(
  salonId: string | undefined | null,
  payload: {
    stored: boolean;
    clients: unknown;
    updatedAt?: string;
  },
) {
  emitToSalon(salonId, RealtimeEvents.CLIENTS_CATALOG_UPDATED, payload);
}

export function emitServiceCatalogUpdated(
  salonId: string | undefined | null,
  payload: {
    stored: boolean;
    serviceCatalog: unknown;
    updatedAt?: string;
  },
) {
  emitToSalon(salonId, RealtimeEvents.SERVICE_CATALOG_UPDATED, payload);
}

export function emitConsultationUpdated(
  salonId: string | undefined | null,
  payload: {
    stored: boolean;
    clientKey: string;
    record: unknown;
    updatedAt?: string;
  },
) {
  emitToSalon(salonId, RealtimeEvents.CONSULTATION_UPDATED, payload);
}

export function emitAppointmentVisitUpdated(
  salonId: string | undefined | null,
  payload: {
    stored: boolean;
    appointmentId: string;
    visit: unknown;
    updatedAt?: string;
  },
) {
  emitToSalon(salonId, RealtimeEvents.APPOINTMENT_VISIT_UPDATED, payload);
}

export function emitProductCatalogUpdated(
  salonId: string | undefined | null,
  payload: {
    stored: boolean;
    products: unknown;
    updatedAt?: string;
  },
) {
  emitToSalon(salonId, RealtimeEvents.PRODUCT_CATALOG_UPDATED, payload);
}

export function emitRampPostUpdated(
  salonId: string | undefined | null,
  payload: { post: unknown },
) {
  emitToSalon(salonId, RealtimeEvents.RAMP_POST_UPDATED, payload);
}
