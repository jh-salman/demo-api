import { Queue } from "bullmq";
import type { Redis } from "ioredis";
import { env } from "../../config/env.js";
import { getIoRedis, ioRedisEnabled } from "../../lib/ioredis.js";
import { processGhostNotesJob } from "./ghost-notes.processor.js";
import type { GhostNotesJobData } from "./ghost-notes.types.js";

export const GHOST_NOTES_QUEUE_NAME = "ghost-notes-brief";

let queue: Queue<GhostNotesJobData> | null | undefined;
let queueConnection: Redis | null = null;

export function ghostNotesQueueEnabled(): boolean {
  return env.GHOST_NOTES_ENABLED && ioRedisEnabled();
}

function getQueueConnection(): Redis | null {
  if (!ghostNotesQueueEnabled()) return null;
  if (queueConnection) return queueConnection;
  const shared = getIoRedis();
  if (!shared) return null;
  queueConnection = shared.duplicate({ maxRetriesPerRequest: null });
  queueConnection.on("error", (err) => {
    console.error("[ghost-notes] queue redis error:", err?.message || err);
  });
  return queueConnection;
}

function getQueue(): Queue<GhostNotesJobData> | null {
  if (!ghostNotesQueueEnabled()) return null;
  if (queue !== undefined) return queue;
  const connection = getQueueConnection();
  if (!connection) {
    queue = null;
    return null;
  }
  queue = new Queue<GhostNotesJobData>(GHOST_NOTES_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  });
  return queue;
}

function runInline(job: GhostNotesJobData): void {
  setImmediate(() => {
    void processGhostNotesJob(job).catch((err) => {
      console.error("[ghost-notes] inline job failed:", err);
    });
  });
}

export async function enqueueGhostNotesBrief(job: GhostNotesJobData): Promise<void> {
  const q = getQueue();
  if (q) {
    await q.add("brief", job, {
      jobId: `${job.appointmentId}:brief`,
    });
    return;
  }
  runInline(job);
}

export { processGhostNotesJob };
