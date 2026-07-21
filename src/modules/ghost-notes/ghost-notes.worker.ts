import { Worker } from "bullmq";
import type { Redis } from "ioredis";
import { env } from "../../config/env.js";
import { getIoRedis, ioRedisEnabled } from "../../lib/ioredis.js";
import { processGhostNotesJob } from "./ghost-notes.processor.js";
import {
  GHOST_NOTES_QUEUE_NAME,
  ghostNotesQueueEnabled,
} from "./ghost-notes.queue.js";
import type { GhostNotesJobData } from "./ghost-notes.types.js";

let worker: Worker<GhostNotesJobData> | null = null;
let workerConnection: Redis | null = null;

function getWorkerConnection(): Redis | null {
  if (!ghostNotesQueueEnabled()) return null;
  if (workerConnection) return workerConnection;
  const shared = getIoRedis();
  if (!shared) return null;
  workerConnection = shared.duplicate({ maxRetriesPerRequest: null });
  workerConnection.on("error", (err) => {
    console.error("[ghost-notes] worker redis error:", err?.message || err);
  });
  return workerConnection;
}

export function startGhostNotesWorker(): Worker<GhostNotesJobData> | null {
  if (!ghostNotesQueueEnabled()) {
    console.log("[ghost-notes] Worker not started (disabled or REDIS_URL missing)");
    return null;
  }
  if (worker) return worker;

  const connection = getWorkerConnection();
  if (!connection) return null;

  worker = new Worker<GhostNotesJobData>(
    GHOST_NOTES_QUEUE_NAME,
    async (job) => {
      await processGhostNotesJob(job.data);
    },
    {
      connection,
      concurrency: env.GHOST_NOTES_WORKER_CONCURRENCY,
    },
  );

  worker.on("completed", (job) => {
    console.log(`[ghost-notes] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[ghost-notes] Job ${job?.id} failed:`, err.message);
  });

  console.log("[ghost-notes] BullMQ worker listening on ghost-notes-brief");
  return worker;
}

export async function stopGhostNotesWorker(): Promise<void> {
  if (!worker) return;
  await worker.close();
  worker = null;
}

export function ghostNotesWorkerCanStart(): boolean {
  return ghostNotesQueueEnabled() && ioRedisEnabled();
}
