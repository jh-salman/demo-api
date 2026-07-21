import {
  clientConsultationService,
  normalizeClientKey,
} from "../modules/client-consultation/client-consultation.service.js";
import { appointmentVisitService } from "../modules/appointment-visit/appointment-visit.service.js";
import { emitConsultationUpdated } from "../realtime/io.js";

type ConsultRecord = Record<string, unknown>;
type ConsultEntry = { ts: number; text: string; appointmentId?: string; source?: string };

function asRecord(v: unknown): ConsultRecord {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as ConsultRecord) : {};
}

function asEntries(v: unknown): ConsultEntry[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (e): e is ConsultEntry =>
      Boolean(e) &&
      typeof e === "object" &&
      typeof (e as ConsultEntry).text === "string",
  );
}

function serviceLinesFromVisit(visit: unknown): string[] {
  const v = asRecord(visit);
  const queue = Array.isArray(v.svcQueue) ? v.svcQueue : [];
  const lines: string[] = [];
  for (const item of queue) {
    const row = asRecord(item);
    const name =
      (typeof row.name === "string" && row.name.trim()) ||
      (typeof row.label === "string" && row.label.trim()) ||
      "";
    if (name) lines.push(name);
  }
  return lines;
}

export type ArchiveVisitInput = {
  id: string;
  clientName: string;
  service: string;
  notes: string;
  start: string;
  end: string;
};

/**
 * Snapshot a completed checkout into consultation history so Ghost Notes treats
 * the client as returning on the next booking.
 */
export async function archiveVisitToConsultation(
  salonId: string,
  apt: ArchiveVisitInput,
) {
  const key = normalizeClientKey(apt.clientName);
  if (!key) return null;

  const existing = await clientConsultationService.get(key, salonId);
  const record = asRecord(existing.record);
  const ts = Date.now();

  const visitRow = await appointmentVisitService.get(apt.id);
  const visit = visitRow.visit;
  const visitServices = serviceLinesFromVisit(visit);

  const chairParts = [
    apt.service?.trim() && `Service: ${apt.service.trim()}`,
    ...visitServices.map((s) => `Performed: ${s}`),
    apt.notes?.trim(),
  ].filter(Boolean);
  const chairText =
    chairParts.join(" · ") ||
    `Visit completed ${new Date(apt.start).toLocaleDateString("en-US")}`;

  const chairEntries = asEntries(record.CHAIR_entries);
  chairEntries.unshift({
    ts,
    text: chairText,
    appointmentId: apt.id,
    source: "checkout",
  });

  const lifeEntries = asEntries(record.LIFE_entries);
  lifeEntries.unshift({
    ts,
    text: `Checkout completed — ${new Date(apt.end || apt.start).toLocaleDateString("en-US")}`,
    appointmentId: apt.id,
    source: "checkout",
  });

  const pathEntries = asEntries(record.PATH_entries);
  if (visitServices.length) {
    pathEntries.unshift({
      ts,
      text: visitServices.join(", "),
      appointmentId: apt.id,
      source: "checkout",
    });
  }

  const ghost = asRecord(record.ghost);
  const next: ConsultRecord = {
    ...record,
    updatedAt: ts,
    CHAIR_entries: chairEntries.slice(0, 40),
    LIFE_entries: lifeEntries.slice(0, 40),
    PATH_entries: pathEntries.slice(0, 40),
    lastCompletedAppointmentId: apt.id,
    lastCompletedAt: new Date(ts).toISOString(),
  };

  if (Object.keys(ghost).length) {
    next.ghost = {
      ...ghost,
      brief_status: "ready",
      appointmentId: apt.id,
    };
  }

  const saved = await clientConsultationService.put(
    key,
    next,
    existing.updatedAt ?? null,
    salonId,
  );

  emitConsultationUpdated(salonId, {
    stored: saved.stored,
    clientKey: key,
    record: saved.record,
    ...(saved.updatedAt ? { updatedAt: saved.updatedAt } : {}),
  });

  return { clientKey: key, record: saved.record };
}
