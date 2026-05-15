import type { Server } from "socket.io";

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
} as const;

export function setIo(server: Server) {
  io = server;
}

export function getIo(): Server | null {
  return io;
}

export function emitAppointmentCreated(payload: { appointment: unknown }) {
  io?.emit(RealtimeEvents.APPOINTMENT_CREATED, payload);
}

export function emitAppointmentUpdated(payload: { appointment: unknown }) {
  io?.emit(RealtimeEvents.APPOINTMENT_UPDATED, payload);
}

export function emitAppointmentDeleted(payload: { id: string }) {
  io?.emit(RealtimeEvents.APPOINTMENT_DELETED, payload);
}

export function emitConfigUpdated(payload: {
  scope: "draft" | "published";
  revision: string;
  webProjectionRevision: string;
  data: unknown;
}) {
  io?.emit(RealtimeEvents.CONFIG_UPDATED, payload);
}

export function emitCalendarToolbarUpdated(payload: {
  stored: boolean;
  parkedFromDrag: unknown;
  toolbarEvents: unknown;
  updatedAt?: string;
}) {
  io?.emit(RealtimeEvents.CALENDAR_TOOLBAR_UPDATED, payload);
}

export function emitClientsCatalogUpdated(payload: {
  stored: boolean;
  clients: unknown;
  updatedAt?: string;
}) {
  io?.emit(RealtimeEvents.CLIENTS_CATALOG_UPDATED, payload);
}

export function emitServiceCatalogUpdated(payload: {
  stored: boolean;
  serviceCatalog: unknown;
  updatedAt?: string;
}) {
  io?.emit(RealtimeEvents.SERVICE_CATALOG_UPDATED, payload);
}
