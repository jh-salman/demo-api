import { env } from "../config/env.js";
import {
  redisCacheGetNumber,
  redisCacheIncr,
  redisCachedRead,
} from "./redisCache.js";
import { LEGACY_SALON_ID } from "./tenant.js";

/**
 * Per-salon catalog cache with a revision counter. `cachedGet` serves the
 * cached payload for the current revision; `invalidate` bumps the revision so
 * the next read misses and reloads. Safe when Redis is off (loader runs directly).
 */
export function createCatalogCache(prefix: string, ttlSeconds?: number) {
  const ttl =
    typeof ttlSeconds === "number" && ttlSeconds > 0
      ? ttlSeconds
      : env.CLIENTS_CACHE_TTL_SECONDS;

  const revKey = (salonId: string) =>
    `${prefix}:${salonId || LEGACY_SALON_ID}:rev`;
  const catalogKey = (salonId: string, rev: number) =>
    `${prefix}:${salonId || LEGACY_SALON_ID}:catalog:r${rev}`;

  return {
    async cachedGet<T>(salonId: string, loader: () => Promise<T>): Promise<T> {
      const id = salonId || LEGACY_SALON_ID;
      const rev = await redisCacheGetNumber(revKey(id));
      return redisCachedRead(catalogKey(id, rev), ttl, loader);
    },
    async invalidate(salonId: string = LEGACY_SALON_ID): Promise<void> {
      await redisCacheIncr(revKey(salonId || LEGACY_SALON_ID));
    },
  };
}
