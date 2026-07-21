import { emitConsultationUpdated } from "../../realtime/io.js";
import {
  clientConsultationService,
  normalizeClientKey,
} from "../client-consultation/client-consultation.service.js";
import {
  loadBriefContext,
  mergeGhostIntoRecord,
} from "./brief-context.service.js";
import type { GhostBriefPayload, GhostNotesJobData } from "./ghost-notes.types.js";

export async function markGhostBriefGenerating(
  job: Pick<GhostNotesJobData, "salonId" | "clientKey" | "clientName" | "appointmentId">,
): Promise<void> {
  const key = normalizeClientKey(job.clientKey || job.clientName);
  const ctx = await loadBriefContext(job.salonId, key, job.clientName);
  const ghost: GhostBriefPayload = {
    brief_status: "generating",
    appointmentId: job.appointmentId,
    generatedAt: new Date().toISOString(),
    ai_brief: null,
    ai_plants: [],
    back_bar: [],
    retail_suggestions: [],
  };
  const next = mergeGhostIntoRecord(ctx.record, ghost);
  const saved = await clientConsultationService.put(
    key,
    next,
    ctx.updatedAt,
    job.salonId,
  );
  emitConsultationUpdated({
    stored: saved.stored,
    clientKey: key,
    record: saved.record,
    ...(saved.updatedAt ? { updatedAt: saved.updatedAt } : {}),
  });
}

export async function writeGhostBrief(
  job: GhostNotesJobData,
  result: Omit<GhostBriefPayload, "brief_status" | "appointmentId"> & {
    brief_status?: GhostBriefPayload["brief_status"];
  },
): Promise<void> {
  const key = normalizeClientKey(job.clientKey || job.clientName);
  const ctx = await loadBriefContext(job.salonId, key, job.clientName);
  const ghost: GhostBriefPayload = {
    brief_status: result.brief_status ?? "ready",
    appointmentId: job.appointmentId,
    generatedAt: new Date().toISOString(),
    ai_brief: result.ai_brief ?? null,
    ai_plants: result.ai_plants ?? [],
    back_bar: result.back_bar ?? [],
    retail_suggestions: result.retail_suggestions ?? [],
    ...(result.error ? { error: result.error } : {}),
  };
  const next = mergeGhostIntoRecord(ctx.record, ghost);
  const saved = await clientConsultationService.put(
    key,
    next,
    ctx.updatedAt,
    job.salonId,
  );
  emitConsultationUpdated({
    stored: saved.stored,
    clientKey: key,
    record: saved.record,
    ...(saved.updatedAt ? { updatedAt: saved.updatedAt } : {}),
  });
}

export async function markGhostBriefFailed(
  job: GhostNotesJobData,
  message: string,
): Promise<void> {
  await writeGhostBrief(job, {
    brief_status: "failed",
    ai_brief: null,
    ai_plants: [],
    back_bar: [],
    retail_suggestions: [],
    error: message,
  });
}
