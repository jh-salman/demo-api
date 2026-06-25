import { env } from "../../config/env.js";
import { redisCacheIncr, redisCachedRead } from "../../lib/redisCache.js";
import { getRedis } from "../../lib/redis.js";

const PREFIX = "clients:v1";
const REV_KEY = `${PREFIX}:rev`;

async function getCatalogRev(): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  try {
    const value = await redis.get<number>(REV_KEY);
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function catalogCacheKey(rev: number) {
  return `${PREFIX}:catalog:r${rev}`;
}

/** Cached GET /api/clients response. */
export async function cachedClientsGet<T>(loader: () => Promise<T>): Promise<T> {
  const rev = await getCatalogRev();
  return redisCachedRead(catalogCacheKey(rev), env.CLIENTS_CACHE_TTL_SECONDS, loader);
}

/** Call after PUT /api/clients (or catalog seed that should bust cache). */
export async function invalidateClientsCache() {
  await redisCacheIncr(REV_KEY);
}
