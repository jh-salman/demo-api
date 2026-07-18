import { ensureDefaultStaffCatalog } from "../../lib/ensure-default-catalog.js";
import { getPrisma } from "../../lib/prisma.js";
import { createJsonRowStore } from "../../lib/json-row-store.js";
import { LEGACY_SALON_ID } from "../../lib/tenant.js";

function store(salonId: string) {
  const prisma = getPrisma();
  if (!prisma) return null;
  return createJsonRowStore(
    prisma.salonxStaffCatalog,
    500,
    salonId || LEGACY_SALON_ID,
  );
}

export const staffService = {
  get: async (salonId: string = LEGACY_SALON_ID) => {
    const id = salonId || LEGACY_SALON_ID;
    const s = store(id);
    if (!s) return { stored: false as const, staff: [] as unknown[] };
    await ensureDefaultStaffCatalog(id);
    const row = await s.get();
    return {
      stored: row.stored,
      staff: row.items,
      ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}),
    };
  },
  put: async (
    staff: unknown,
    expectedUpdatedAt?: string | null,
    salonId: string = LEGACY_SALON_ID,
  ) => {
    const id = salonId || LEGACY_SALON_ID;
    const s = store(id);
    if (!s) throw new Error("DATABASE_URL not configured");
    const row = await s.put(staff, { expectedUpdatedAt });
    return {
      stored: row.stored,
      staff: row.items,
      ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}),
    };
  },
};
