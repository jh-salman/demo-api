import { createCatalogCache } from "../../lib/catalog-cache.js";
import { LEGACY_SALON_ID } from "../../lib/tenant.js";

const cache = createCatalogCache("clients:v2");

/** Cached GET /api/clients response (per salon). */
export async function cachedClientsGet<T>(
  salonId: string,
  loader: () => Promise<T>,
): Promise<T> {
  return cache.cachedGet(salonId || LEGACY_SALON_ID, loader);
}

/** Call after PUT /api/clients (or catalog seed that should bust cache). */
export async function invalidateClientsCache(salonId: string = LEGACY_SALON_ID) {
  await cache.invalidate(salonId || LEGACY_SALON_ID);
}
