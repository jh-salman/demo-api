import { Redis, type RedisOptions } from "ioredis";
import { env } from "../config/env.js";

/**
 * ioredis (TCP) — used for pub/sub, primarily the Socket.IO Redis adapter so
 * realtime emits fan out across every instance. Separate from the Upstash REST
 * client in `redis.ts` (which only powers the HTTP cache).
 *
 * Returns null when REDIS_URL is not configured (single-instance dev is fine).
 */
let pub: Redis | null | undefined;

function baseOptions(): RedisOptions {
  return {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
    retryStrategy: (times) => Math.min(times * 200, 3000),
  };
}

function createClient(): Redis | null {
  if (!env.REDIS_URL) return null;
  const client = new Redis(env.REDIS_URL, baseOptions());
  client.on("error", (err) => {
    console.error("[ioredis] connection error:", err?.message || err);
  });
  return client;
}

/** Shared publisher / general-purpose ioredis connection (or null). */
export function getIoRedis(): Redis | null {
  if (pub !== undefined) return pub;
  pub = createClient();
  return pub;
}

/**
 * A dedicated connection (e.g. for a subscriber, which cannot run normal
 * commands). Duplicates the shared client's config. Null when disabled.
 */
export function createIoRedisConnection(): Redis | null {
  const shared = getIoRedis();
  if (!shared) return null;
  const dup = shared.duplicate();
  dup.on("error", (err) => {
    console.error("[ioredis] subscriber error:", err?.message || err);
  });
  return dup;
}

export function ioRedisEnabled(): boolean {
  return Boolean(env.REDIS_URL);
}
