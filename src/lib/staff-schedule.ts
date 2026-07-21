/**
 * Per-stylist schedule on top of salon booking hours.
 *
 * Each staff object in the staff catalog (JSON) may carry:
 *   workingHours?: { mon: [{start,end}], ... }  — overrides salon hours for that day
 *   breaks?:       { mon: [{start,end}], ... }  — lunch/breaks subtracted from windows
 *   canSelfManage?: boolean                      — owner grant to edit own schedule live
 *
 * Availability window for a stylist on a given day:
 *   (salon window ∩ stylist workingHours) − breaks
 * If the stylist has no workingHours for that day, the salon window is used as-is.
 */

export type Window = { start: string; end: string };
export type DaySchedule = Record<string, Window[]>;

export const DAY_KEYS = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
] as const;

type Interval = { s: number; e: number };

export function parseHm(hm: unknown): number | null {
  if (typeof hm !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

export function toHm(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function toIntervals(windows: unknown): Interval[] {
  if (!Array.isArray(windows)) return [];
  const out: Interval[] = [];
  for (const w of windows) {
    if (!w || typeof w !== "object") continue;
    const s = parseHm((w as Window).start);
    const e = parseHm((w as Window).end);
    if (s == null || e == null || e <= s) continue;
    out.push({ s, e });
  }
  return mergeIntervals(out);
}

function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = [...list].sort((a, b) => a.s - b.s);
  const merged: Interval[] = [];
  for (const cur of sorted) {
    const last = merged[merged.length - 1];
    if (last && cur.s <= last.e) {
      last.e = Math.max(last.e, cur.e);
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
}

/** A ∩ B for two interval lists. */
function intersect(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const x of a) {
    for (const y of b) {
      const s = Math.max(x.s, y.s);
      const e = Math.min(x.e, y.e);
      if (e > s) out.push({ s, e });
    }
  }
  return mergeIntervals(out);
}

/** Subtract `cuts` from `base` interval list. */
function subtract(base: Interval[], cuts: Interval[]): Interval[] {
  if (!cuts.length) return base;
  let result = [...base];
  for (const cut of cuts) {
    const next: Interval[] = [];
    for (const iv of result) {
      if (cut.e <= iv.s || cut.s >= iv.e) {
        next.push(iv);
        continue;
      }
      if (cut.s > iv.s) next.push({ s: iv.s, e: Math.min(cut.s, iv.e) });
      if (cut.e < iv.e) next.push({ s: Math.max(cut.e, iv.s), e: iv.e });
    }
    result = next;
  }
  return result.filter((iv) => iv.e > iv.s);
}

function dayWindows(schedule: unknown, dayKey: string): unknown {
  if (!schedule || typeof schedule !== "object" || Array.isArray(schedule)) {
    return undefined;
  }
  return (schedule as Record<string, unknown>)[dayKey];
}

/**
 * Effective bookable windows for a stylist on `dayKey`.
 * Returns Window[] (hm strings). Empty = stylist not bookable that day.
 */
export function effectiveStaffWindows(
  salonWindows: Window[] | undefined,
  staff: { workingHours?: unknown; breaks?: unknown } | null | undefined,
  dayKey: string,
): Window[] {
  const salon = toIntervals(salonWindows);
  if (!salon.length) return [];

  const staffDay = staff ? dayWindows(staff.workingHours, dayKey) : undefined;
  // If stylist defines working hours for this day, intersect; else use salon as-is.
  let base: Interval[];
  if (staffDay !== undefined) {
    const staffIv = toIntervals(staffDay);
    if (!staffIv.length) return []; // explicitly empty = off that day
    base = intersect(salon, staffIv);
  } else {
    base = salon;
  }

  const breaks = staff ? toIntervals(dayWindows(staff.breaks, dayKey)) : [];
  const net = subtract(base, breaks);

  return net.map((iv) => ({ start: toHm(iv.s), end: toHm(iv.e) }));
}

/** Normalize a day-keyed schedule (used when saving from Settings). */
export function normalizeDaySchedule(raw: unknown): DaySchedule {
  const out: DaySchedule = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const src = raw as Record<string, unknown>;
  for (const key of DAY_KEYS) {
    const iv = toIntervals(src[key]);
    if (iv.length) out[key] = iv.map((x) => ({ start: toHm(x.s), end: toHm(x.e) }));
  }
  return out;
}
