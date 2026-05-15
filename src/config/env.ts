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
} as const;
