import { randomUUID } from "node:crypto";
import { staffService } from "../modules/staff/staff.service.js";
import { normalizeDaySchedule } from "./staff-schedule.js";
import { createCatalogCache } from "./catalog-cache.js";

const staffCache = createCatalogCache("staff:v2");

export type StaffCatalogItem = Record<string, unknown> & {
  id?: string;
  name?: string;
  userId?: string;
  canSelfManage?: boolean;
  workingHours?: unknown;
  breaks?: unknown;
};

/** Normalize schedule fields on every staff catalog item before save. */
export function normalizeStaffCatalogItems(raw: unknown): StaffCatalogItem[] {
  const list = Array.isArray(raw) ? raw : [];
  return list.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { id: `staff-${randomUUID().slice(0, 8)}`, name: "Stylist" };
    }
    const row = { ...(item as StaffCatalogItem) };
    if (!row.id || typeof row.id !== "string") {
      row.id = `staff-${randomUUID().slice(0, 8)}`;
    }
    if (typeof row.name !== "string" || !row.name.trim()) {
      row.name = "Stylist";
    } else {
      row.name = row.name.trim();
    }
    if (row.workingHours !== undefined) {
      row.workingHours = normalizeDaySchedule(row.workingHours);
    }
    if (row.breaks !== undefined) {
      row.breaks = normalizeDaySchedule(row.breaks);
    }
    if (row.canSelfManage !== undefined) {
      row.canSelfManage = Boolean(row.canSelfManage);
    }
    if (row.userId !== undefined && row.userId !== null) {
      row.userId = String(row.userId);
    }
    return row;
  });
}

/**
 * Ensure an org member has a stylist row in the salon staff catalog.
 * Match by userId first; never duplicates. Best-effort — invite must not fail.
 */
export async function ensureStaffCatalogForMember(opts: {
  salonId: string;
  userId: string;
  name: string;
}): Promise<StaffCatalogItem | null> {
  try {
    const current = await staffService.get(opts.salonId);
    const list = (Array.isArray(current.staff)
      ? current.staff
      : []) as StaffCatalogItem[];

    const byUser = list.find((s) => String(s.userId || "") === opts.userId);
    if (byUser) return byUser;

    const name = opts.name.trim() || "Stylist";
    const newItem: StaffCatalogItem = {
      id: `staff-${opts.userId.slice(0, 8)}`,
      name,
      userId: opts.userId,
      canSelfManage: false,
    };

    // Avoid id collision with seed rows.
    if (list.some((s) => String(s.id) === newItem.id)) {
      newItem.id = `staff-${randomUUID().slice(0, 8)}`;
    }

    const saved = await staffService.put(
      [...list, newItem],
      (current as { updatedAt?: string }).updatedAt ?? null,
      opts.salonId,
    );
    await staffCache.invalidate(opts.salonId);
    const next = (Array.isArray(saved.staff) ? saved.staff : []) as StaffCatalogItem[];
    return next.find((s) => String(s.userId || "") === opts.userId) || newItem;
  } catch {
    return null;
  }
}
