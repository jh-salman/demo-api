import { getRedis, isRedisEnabled } from "./redis.js";

export async function redisCacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const value = await redis.get<T>(key);
    return value ?? null;
  } catch {
    return null;
  }
}

export async function redisCacheSet(key: string, value: unknown, ttlSeconds: number) {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(key, value, { ex: ttlSeconds });
  } catch {
    /* best effort */
  }
}

export async function redisCacheIncr(key: string) {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.incr(key);
  } catch {
    /* ignore */
  }
}

export async function redisCachedRead<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  if (!isRedisEnabled()) return loader();
  const hit = await redisCacheGet<T>(key);
  if (hit !== null) return hit;
  const value = await loader();
  await redisCacheSet(key, value, ttlSeconds);
  return value;
}
