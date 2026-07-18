import { env } from "../../config/env.js";
import { redisCacheIncr, redisCachedRead } from "../../lib/redisCache.js";
import { getRedis } from "../../lib/redis.js";
import { LEGACY_SALON_ID } from "../../lib/tenant.js";

const PREFIX = "clients:v2";

function revKey(salonId: string) {
  return `${PREFIX}:${salonId || LEGACY_SALON_ID}:rev`;
}

async function getCatalogRev(salonId: string): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  try {
    const value = await redis.get<number>(revKey(salonId));
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function catalogCacheKey(salonId: string, rev: number) {
  return `${PREFIX}:${salonId || LEGACY_SALON_ID}:catalog:r${rev}`;
}

/** Cached GET /api/clients response (per salon). */
export async function cachedClientsGet<T>(
  salonId: string,
  loader: () => Promise<T>,
): Promise<T> {
  const id = salonId || LEGACY_SALON_ID;
  const rev = await getCatalogRev(id);
  return redisCachedRead(
    catalogCacheKey(id, rev),
    env.CLIENTS_CACHE_TTL_SECONDS,
    loader,
  );
}

/** Call after PUT /api/clients (or catalog seed that should bust cache). */
export async function invalidateClientsCache(salonId: string = LEGACY_SALON_ID) {
  await redisCacheIncr(revKey(salonId || LEGACY_SALON_ID));
}
