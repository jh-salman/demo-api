import { calendarToolbarService } from "../modules/calendar-toolbar/calendar-toolbar.service.js";
import { emitCalendarToolbarUpdated } from "../realtime/io.js";
import type { WaitlistDto } from "../modules/waitlist/waitlist.service.js";

type ToolbarRow = Record<string, unknown>;

/**
 * Append a microsite waitlist entry to the salon calendar toolbar (waiting list
 * pills). Dedupes by waitlist entry id.
 */
export async function pushWaitlistEntryToToolbar(
  salonId: string,
  entry: WaitlistDto,
) {
  const state = await calendarToolbarService.get(salonId);
  const toolbarEvents = Array.isArray(state.toolbarEvents)
    ? ([...state.toolbarEvents] as ToolbarRow[])
    : [];
  const parkedFromDrag = Array.isArray(state.parkedFromDrag)
    ? state.parkedFromDrag
    : [];

  const toolbarId = `wl-${entry.id}`;
  if (toolbarEvents.some((t) => String(t?.id || "") === toolbarId)) {
    return state;
  }

  const bits: string[] = [];
  if (entry.preferredWindow) bits.push(entry.preferredWindow);
  if (entry.notes) bits.push(entry.notes);
  if (entry.preferredDates?.length) {
    bits.push(entry.preferredDates.join(", "));
  }

  toolbarEvents.push({
    id: toolbarId,
    title: entry.clientName,
    service: bits.join(" · ") || "Waitlist",
    waitlistAddedAt: entry.createdAt,
    color: "#FA1BFE",
    waitlistEntryId: entry.id,
    clientPhone: entry.clientPhone,
  });

  const next = await calendarToolbarService.put(
    parkedFromDrag,
    toolbarEvents.slice(0, 500),
    state.stored && "updatedAt" in state ? state.updatedAt : null,
    salonId,
  );

  emitCalendarToolbarUpdated(salonId, {
    stored: next.stored,
    parkedFromDrag: next.parkedFromDrag,
    toolbarEvents: next.toolbarEvents,
    ...(next.stored && "updatedAt" in next ? { updatedAt: next.updatedAt } : {}),
  });

  return next;
}
