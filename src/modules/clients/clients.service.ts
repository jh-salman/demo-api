import { ensureDefaultClientCatalog } from "../../lib/ensure-default-catalog.js";
import { getPrisma } from "../../lib/prisma.js";
import { createJsonRowStore } from "../../lib/json-row-store.js";
import { LEGACY_SALON_ID } from "../../lib/tenant.js";

function store(salonId: string) {
  const prisma = getPrisma();
  if (!prisma) return null;
  return createJsonRowStore(
    prisma.salonxClientCatalog,
    500,
    salonId || LEGACY_SALON_ID,
  );
}

export const clientsService = {
  get: async (salonId: string = LEGACY_SALON_ID) => {
    const id = salonId || LEGACY_SALON_ID;
    const s = store(id);
    if (!s) return { stored: false as const, clients: [] as unknown[] };
    await ensureDefaultClientCatalog(id);
    const row = await s.get();
    return {
      stored: row.stored,
      clients: row.items,
      ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}),
    };
  },
  put: async (
    clients: unknown,
    expectedUpdatedAt?: string | null,
    salonId: string = LEGACY_SALON_ID,
  ) => {
    const id = salonId || LEGACY_SALON_ID;
    const s = store(id);
    if (!s) throw new Error("DATABASE_URL not configured");
    const row = await s.put(clients, { expectedUpdatedAt });
    return {
      stored: row.stored,
      clients: row.items,
      ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}),
    };
  },
};
