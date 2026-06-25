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
  /** OpenAI — optional; RAMP AI routes when set. */
  OPENAI_API_KEY: process.env.OPENAI_API_KEY?.trim() ?? "",
  /** GET /api/clients cache TTL in seconds (default 60). */
  CLIENTS_CACHE_TTL_SECONDS: (() => {
    const n = Number(process.env.CLIENTS_CACHE_TTL_SECONDS);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 60;
  })(),
} as const;
