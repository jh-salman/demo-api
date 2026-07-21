import { getIoRedis, ioRedisEnabled } from "./ioredis.js";

/**
 * Cache layer backed by ioredis (TCP). Values are JSON-encoded. All keys are
 * namespaced under `salonx:cache:` to stay clear of session / adapter keys.
 */
const NS = "salonx:cache:";

export function cacheEnabled(): boolean {
  return ioRedisEnabled();
}

export async function redisCacheGet<T>(key: string): Promise<T | null> {
  const redis = getIoRedis();
  if (!redis) return null;
  try {
    const value = await redis.get(NS + key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

export async function redisCacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number,
) {
  const redis = getIoRedis();
  if (!redis) return;
  try {
    await redis.set(NS + key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    /* best effort */
  }
}

export async function redisCacheIncr(key: string) {
  const redis = getIoRedis();
  if (!redis) return;
  try {
    await redis.incr(NS + key);
  } catch {
    /* ignore */
  }
}

/** Read an integer counter (e.g. a cache revision). Returns 0 when absent. */
export async function redisCacheGetNumber(key: string): Promise<number> {
  const redis = getIoRedis();
  if (!redis) return 0;
  try {
    const value = await redis.get(NS + key);
    const n = value ? Number.parseInt(value, 10) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export async function redisCachedRead<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  if (!ioRedisEnabled()) return loader();
  const hit = await redisCacheGet<T>(key);
  if (hit !== null) return hit;
  const value = await loader();
  await redisCacheSet(key, value, ttlSeconds);
  return value;
}
