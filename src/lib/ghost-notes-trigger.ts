import { env } from "../config/env.js";
import { normalizeClientKey } from "../modules/client-consultation/client-consultation.service.js";
import { enqueueGhostNotesBrief } from "../modules/ghost-notes/ghost-notes.queue.js";
import type { GhostNotesJobData } from "../modules/ghost-notes/ghost-notes.types.js";

export type GhostNotesTriggerInput = {
  salonId: string;
  appointmentId: string;
  clientName: string;
  clientPhone?: string | null;
  service?: string;
  staffId?: string | null;
  appointmentNotes?: string | null;
};

/** Fire-and-forget brief generation when an appointment is booked. */
export function triggerGhostNotesBrief(input: GhostNotesTriggerInput): void {
  if (!env.GHOST_NOTES_ENABLED) return;
  if (!input.appointmentId || !input.clientName?.trim()) return;

  const services = input.service?.trim()
    ? [input.service.trim()]
    : ["General service"];

  const job: GhostNotesJobData = {
    salonId: input.salonId,
    clientKey: normalizeClientKey(input.clientName),
    clientName: input.clientName.trim(),
    clientPhone: input.clientPhone ?? null,
    appointmentId: input.appointmentId,
    services,
    staffId: input.staffId ?? null,
    appointmentNotes: input.appointmentNotes?.trim() || null,
  };

  void enqueueGhostNotesBrief(job).catch((err) => {
    console.error("[ghost-notes] enqueue failed:", err);
  });
}
