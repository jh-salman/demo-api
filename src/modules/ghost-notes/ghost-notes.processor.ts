import { generateBrief } from "./brief-generator.service.js";
import { loadBriefContext } from "./brief-context.service.js";
import {
  markGhostBriefFailed,
  markGhostBriefGenerating,
  writeGhostBrief,
} from "./brief-writer.service.js";
import type { GhostNotesJobData } from "./ghost-notes.types.js";

export async function processGhostNotesJob(job: GhostNotesJobData): Promise<void> {
  console.log(
    `[ghost-notes] Generating brief for ${job.clientName} (${job.appointmentId})`,
  );

  await markGhostBriefGenerating(job);

  try {
    const ctx = await loadBriefContext(job.salonId, job.clientKey, job.clientName);
    const result = await generateBrief({
      clientName: job.clientName,
      services: job.services,
      isNewClient: ctx.isNewClient,
      priorSessions: ctx.priorSessions,
      allergyFlags: ctx.allergyFlags,
      lifestyleNotes: ctx.lifestyleNotes,
      appointmentNotes: job.appointmentNotes ?? null,
      hasReferencePhoto: ctx.hasReferencePhoto,
    });

    await writeGhostBrief(job, {
      brief_status: "ready",
      ai_brief: result.brief,
      ai_plants: result.plants,
      back_bar: result.back_bar,
      retail_suggestions: result.retail_suggestions,
    });

    console.log(`[ghost-notes] Brief ready for ${job.clientName}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Brief generation failed";
    console.error(`[ghost-notes] Failed for ${job.appointmentId}:`, err);
    await markGhostBriefFailed(job, message);
    throw err;
  }
}
