import { ensureDefaultProductCatalog } from "../../lib/ensure-default-catalog.js";
import { getPrisma } from "../../lib/prisma.js";
import { createJsonRowStore } from "../../lib/json-row-store.js";

function store() {
  const prisma = getPrisma();
  if (!prisma) return null;
  return createJsonRowStore(prisma.salonxProductCatalog);
}

export const productCatalogService = {
  get: async () => {
    const s = store();
    if (!s) return { stored: false as const, products: [] as unknown[] };
    await ensureDefaultProductCatalog();
    const row = await s.get();
    return {
      stored: row.stored,
      products: row.items,
      ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}),
    };
  },
  put: async (products: unknown, expectedUpdatedAt?: string | null) => {
    const s = store();
    if (!s) throw new Error("DATABASE_URL not configured");
    const row = await s.put(products, { expectedUpdatedAt });
    return {
      stored: row.stored,
      products: row.items,
      ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}),
    };
  },
};
