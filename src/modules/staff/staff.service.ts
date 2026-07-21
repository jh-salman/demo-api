import { ensureDefaultStaffCatalog } from "../../lib/ensure-default-catalog.js";
import { getPrisma } from "../../lib/prisma.js";
import { createJsonRowStore } from "../../lib/json-row-store.js";
import { LEGACY_SALON_ID } from "../../lib/tenant.js";
import {
  normalizeDaySchedule,
  type DaySchedule,
} from "../../lib/staff-schedule.js";
import {
  normalizeStaffCatalogItems,
  type StaffCatalogItem,
} from "../../lib/staff-catalog.js";

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
    const normalized = normalizeStaffCatalogItems(staff);
    const row = await s.put(normalized, { expectedUpdatedAt });
    return {
      stored: row.stored,
      staff: row.items,
      ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}),
    };
  },

  /**
   * Patch one stylist's workingHours / breaks (and optionally canSelfManage for owners).
   */
  patchSchedule: async (
    salonId: string,
    staffId: string,
    patch: {
      workingHours?: unknown;
      breaks?: unknown;
      canSelfManage?: boolean;
    },
    expectedUpdatedAt?: string | null,
  ) => {
    const current = await staffService.get(salonId);
    const list = (Array.isArray(current.staff)
      ? current.staff
      : []) as StaffCatalogItem[];
    const idx = list.findIndex((s) => String(s.id) === String(staffId));
    if (idx < 0) {
      const err = new Error("Staff not found") as Error & { status: number };
      err.status = 404;
      throw err;
    }
    const next = { ...list[idx] };
    if (patch.workingHours !== undefined) {
      next.workingHours = normalizeDaySchedule(patch.workingHours) as DaySchedule;
    }
    if (patch.breaks !== undefined) {
      next.breaks = normalizeDaySchedule(patch.breaks) as DaySchedule;
    }
    if (patch.canSelfManage !== undefined) {
      next.canSelfManage = Boolean(patch.canSelfManage);
    }
    const items = [...list];
    items[idx] = next;
    return staffService.put(
      items,
      expectedUpdatedAt ?? (current as { updatedAt?: string }).updatedAt ?? null,
      salonId,
    );
  },
};
