import { getPrisma } from "../../lib/prisma.js";
import { createJsonRowStore } from "../../lib/json-row-store.js";

function store() {
  const prisma = getPrisma();
  if (!prisma) return null;
  return createJsonRowStore(prisma.salonxClientCatalog);
}

export const clientsService = {
  get: async () => {
    const s = store();
    if (!s) return { stored: false as const, clients: [] as unknown[] };
    const row = await s.get();
    return {
      stored: row.stored,
      clients: row.items,
      ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}),
    };
  },
  put: async (clients: unknown, expectedUpdatedAt?: string | null) => {
    const s = store();
    if (!s) throw new Error("DATABASE_URL not configured");
    const row = await s.put(clients, { expectedUpdatedAt });
    return {
      stored: row.stored,
      clients: row.items,
      ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}),
    };
  },
};
