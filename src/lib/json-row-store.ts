import type { Prisma } from "@prisma/client";
import { getPrisma } from "./prisma.js";

export type JsonRowGetResult = {
  stored: boolean;
  items: unknown[];
  updatedAt?: string;
};

export type JsonRowPutOptions = {
  expectedUpdatedAt?: string | null;
};

export class JsonRowConflictError extends Error {
  readonly status = 409;
  readonly current: JsonRowGetResult;

  constructor(current: JsonRowGetResult) {
    super("Catalog was updated elsewhere");
    this.name = "JsonRowConflictError";
    this.current = current;
  }
}

type RowDelegate = {
  findUnique: (args: { where: { id: string } }) => Promise<{
    items: unknown;
    updatedAt: Date;
  } | null>;
  upsert: (args: {
    where: { id: string };
    create: { id: string; items: Prisma.InputJsonValue };
    update: { items: Prisma.InputJsonValue };
  }) => Promise<{ items: unknown; updatedAt: Date }>;
};

export function createJsonRowStore(delegate: RowDelegate, maxItems = 500) {
  function asItems(v: unknown): unknown[] {
    return Array.isArray(v) ? v.slice(0, maxItems) : [];
  }

  async function get(): Promise<JsonRowGetResult> {
    const prisma = getPrisma();
    if (!prisma) {
      return { stored: false, items: [] };
    }
    const row = await delegate.findUnique({ where: { id: "default" } });
    if (!row) {
      return { stored: false, items: [] };
    }
    return {
      stored: true,
      items: row.items as unknown[],
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async function put(items: unknown, opts: JsonRowPutOptions = {}): Promise<JsonRowGetResult> {
    const prisma = getPrisma();
    if (!prisma) {
      throw new Error("DATABASE_URL not configured");
    }
    const payload = asItems(items) as Prisma.InputJsonValue;
    const expected = opts.expectedUpdatedAt?.trim();
    if (expected) {
      const existing = await delegate.findUnique({ where: { id: "default" } });
      if (existing && existing.updatedAt.toISOString() !== expected) {
        throw new JsonRowConflictError({
          stored: true,
          items: existing.items as unknown[],
          updatedAt: existing.updatedAt.toISOString(),
        });
      }
    }
    await delegate.upsert({
      where: { id: "default" },
      create: { id: "default", items: payload },
      update: { items: payload },
    });
    return get();
  }

  return { get, put };
}
