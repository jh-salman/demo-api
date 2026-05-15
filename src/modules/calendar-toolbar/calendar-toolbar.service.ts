import type { Prisma } from "@prisma/client";
import { getPrisma } from "../../lib/prisma.js";

const MAX_ITEMS = 500;

function asJsonArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v.slice(0, MAX_ITEMS) : [];
}

async function getToolbarState() {
  const prisma = getPrisma();
  if (!prisma) {
    return {
      stored: false as const,
      parkedFromDrag: [] as unknown[],
      toolbarEvents: [] as unknown[],
    };
  }
  const row = await prisma.salonxCalendarToolbar.findUnique({
    where: { id: "default" },
  });
  if (!row) {
    return {
      stored: false as const,
      parkedFromDrag: [] as unknown[],
      toolbarEvents: [] as unknown[],
    };
  }
  return {
    stored: true as const,
    parkedFromDrag: row.parkedFromDrag as unknown[],
    toolbarEvents: row.toolbarEvents as unknown[],
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function putToolbarState(parkedFromDrag: unknown, toolbarEvents: unknown) {
  const prisma = getPrisma();
  if (!prisma) {
    throw new Error("DATABASE_URL not configured");
  }
  const p = asJsonArray(parkedFromDrag) as Prisma.InputJsonValue;
  const t = asJsonArray(toolbarEvents) as Prisma.InputJsonValue;
  await prisma.salonxCalendarToolbar.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      parkedFromDrag: p,
      toolbarEvents: t,
    },
    update: {
      parkedFromDrag: p,
      toolbarEvents: t,
    },
  });
  return getToolbarState();
}

export const calendarToolbarService = {
  get: getToolbarState,
  put: putToolbarState,
};
