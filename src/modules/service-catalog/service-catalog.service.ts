import { getPrisma } from "../../lib/prisma.js";
import { createJsonRowStore } from "../../lib/json-row-store.js";

function store() {
  const prisma = getPrisma();
  if (!prisma) return null;
  return createJsonRowStore(prisma.salonxServiceCatalog);
}

export const serviceCatalogService = {
  get: async () => {
    const s = store();
    if (!s) return { stored: false as const, serviceCatalog: [] as unknown[] };
    const row = await s.get();
    return {
      stored: row.stored,
      serviceCatalog: row.items,
      ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}),
    };
  },
  put: async (serviceCatalog: unknown, expectedUpdatedAt?: string | null) => {
    const s = store();
    if (!s) throw new Error("DATABASE_URL not configured");
    const row = await s.put(serviceCatalog, { expectedUpdatedAt });
    return {
      stored: row.stored,
      serviceCatalog: row.items,
      ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}),
    };
  },
};
