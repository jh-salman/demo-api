import "dotenv/config";

const portRaw = process.env.PORT;
const port = portRaw ? Number(portRaw) : 4000;

export const env = {
  NODE_ENV: (process.env.NODE_ENV ?? "development") as
    | "development"
    | "production"
    | "test",
  PORT: Number.isFinite(port) && port > 0 ? port : 4000,
  /** Optional — when unset, config + appointments use file fallback / 503 where DB is required. */
  DATABASE_URL: process.env.DATABASE_URL?.trim() ?? "",
  /** Upstash Redis REST (redis.io) — optional; GET /api/clients cache when set. */
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL?.trim() ?? "",
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ?? "",
  /**
   * Redis TCP URL for ioredis (pub/sub) — powers the Socket.IO Redis adapter so
   * realtime emits reach every instance. Use `rediss://` for TLS (Upstash).
   */
  REDIS_URL: process.env.REDIS_URL?.trim() ?? "",
  /** OpenAI — optional; RAMP AI routes when set. */
  OPENAI_API_KEY: process.env.OPENAI_API_KEY?.trim() ?? "",
  /** Engine 01 Ghost Notes — async pre-consultation briefs (default on). */
  GHOST_NOTES_ENABLED: (process.env.GHOST_NOTES_ENABLED ?? "1") !== "0",
  /** Start BullMQ worker inside API process (dev convenience; default on in development). */
  GHOST_NOTES_INLINE_WORKER:
    process.env.GHOST_NOTES_INLINE_WORKER === "1" ||
    (process.env.GHOST_NOTES_INLINE_WORKER !== "0" &&
      (process.env.NODE_ENV ?? "development") === "development"),
  /** OpenAI model for returning-client briefs. */
  GHOST_NOTES_MODEL: process.env.GHOST_NOTES_MODEL?.trim() || "gpt-4o-mini",
  /** BullMQ worker concurrency when REDIS_URL is set. */
  GHOST_NOTES_WORKER_CONCURRENCY: (() => {
    const n = Number(process.env.GHOST_NOTES_WORKER_CONCURRENCY);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 5;
  })(),
  /** GET /api/clients cache TTL in seconds (default 60). */
  CLIENTS_CACHE_TTL_SECONDS: (() => {
    const n = Number(process.env.CLIENTS_CACHE_TTL_SECONDS);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 60;
  })(),
} as const;
