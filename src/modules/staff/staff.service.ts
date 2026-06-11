import { ensureDefaultStaffCatalog } from "../../lib/ensure-default-catalog.js";
import { getPrisma } from "../../lib/prisma.js";
import { createJsonRowStore } from "../../lib/json-row-store.js";

function store() {
  const prisma = getPrisma();
  if (!prisma) return null;
  return createJsonRowStore(prisma.salonxStaffCatalog);
}

export const staffService = {
  get: async () => {
    const s = store();
    if (!s) return { stored: false as const, staff: [] as unknown[] };
    await ensureDefaultStaffCatalog();
    const row = await s.get();
    return {
      stored: row.stored,
      staff: row.items,
      ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}),
    };
  },
  put: async (staff: unknown, expectedUpdatedAt?: string | null) => {
    const s = store();
    if (!s) throw new Error("DATABASE_URL not configured");
    const row = await s.put(staff, { expectedUpdatedAt });
    return {
      stored: row.stored,
      staff: row.items,
      ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}),
    };
  },
};
