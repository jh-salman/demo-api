import type { Prisma } from "@prisma/client";
import { getPrisma } from "../../lib/prisma.js";
import { JsonRowConflictError } from "../../lib/json-row-store.js";
import {
  isTransientPrismaDbError,
  notePrismaDbFailure,
  shouldSkipPrismaDb,
} from "../../lib/prisma-resilience.js";

const MAX_ITEMS = 500;

function emptyToolbarState() {
  return {
    stored: false as const,
    parkedFromDrag: [] as unknown[],
    toolbarEvents: [] as unknown[],
  };
}

function asJsonArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v.slice(0, MAX_ITEMS) : [];
}

async function getToolbarState() {
  const prisma = getPrisma();
  if (!prisma || shouldSkipPrismaDb()) {
    return emptyToolbarState();
  }
  try {
    const row = await prisma.salonxCalendarToolbar.findUnique({
      where: { id: "default" },
    });
    if (!row) {
      return emptyToolbarState();
    }
    return {
      stored: true as const,
      parkedFromDrag: row.parkedFromDrag as unknown[],
      toolbarEvents: row.toolbarEvents as unknown[],
      updatedAt: row.updatedAt.toISOString(),
    };
  } catch (e) {
    if (isTransientPrismaDbError(e)) notePrismaDbFailure(e);
    return emptyToolbarState();
  }
}

async function putToolbarState(
  parkedFromDrag: unknown,
  toolbarEvents: unknown,
  expectedUpdatedAt?: string | null,
) {
  const prisma = getPrisma();
  if (!prisma) {
    throw new Error("DATABASE_URL not configured");
  }
  const expected = expectedUpdatedAt?.trim();
  if (expected) {
    const existing = await prisma.salonxCalendarToolbar.findUnique({
      where: { id: "default" },
    });
    if (existing && existing.updatedAt.toISOString() !== expected) {
      throw new JsonRowConflictError({
        stored: true,
        items: [
          existing.parkedFromDrag as unknown[],
          existing.toolbarEvents as unknown[],
        ],
        updatedAt: existing.updatedAt.toISOString(),
      });
    }
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
