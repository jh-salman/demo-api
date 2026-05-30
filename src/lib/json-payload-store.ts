import type { Prisma } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import {
  isTransientPrismaDbError,
  notePrismaDbFailure,
  shouldSkipPrismaDb,
} from "./prisma-resilience.js";

export type JsonPayloadGetResult = {
  stored: boolean;
  payload: Record<string, unknown> | null;
  updatedAt?: string;
};

export type JsonPayloadPutOptions = {
  expectedUpdatedAt?: string | null;
};

export class JsonPayloadConflictError extends Error {
  readonly status = 409;
  readonly current: JsonPayloadGetResult;

  constructor(current: JsonPayloadGetResult) {
    super("Record was updated elsewhere");
    this.name = "JsonPayloadConflictError";
    this.current = current;
  }
}

// Prisma delegates vary by model id field — keep loose typing here.
type PayloadDelegate = {
  findUnique: (args: { where: Record<string, string> }) => Promise<{
    payload: unknown;
    updatedAt: Date;
  } | null>;
  upsert: (args: {
    where: Record<string, string>;
    create: Record<string, unknown>;
    update: { payload: Prisma.InputJsonValue };
  }) => Promise<{ payload: unknown; updatedAt: Date }>;
};

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function createJsonPayloadStore(
  delegate: PayloadDelegate,
  idField: string,
) {
  async function get(id: string): Promise<JsonPayloadGetResult> {
    const prisma = getPrisma();
    if (!prisma || shouldSkipPrismaDb()) {
      return { stored: false, payload: null };
    }
    try {
      const row = await delegate.findUnique({ where: { [idField]: id } });
      if (!row) {
        return { stored: false, payload: null };
      }
      return {
        stored: true,
        payload: asObject(row.payload),
        updatedAt: row.updatedAt.toISOString(),
      };
    } catch (e) {
      if (isTransientPrismaDbError(e)) notePrismaDbFailure(e);
      return { stored: false, payload: null };
    }
  }

  async function put(
    id: string,
    payload: unknown,
    opts: JsonPayloadPutOptions = {},
  ): Promise<JsonPayloadGetResult> {
    const prisma = getPrisma();
    if (!prisma) {
      throw new Error("DATABASE_URL not configured");
    }
    const body = asObject(payload) as Prisma.InputJsonValue;
    const expected = opts.expectedUpdatedAt?.trim();
    if (expected) {
      const existing = await delegate.findUnique({ where: { [idField]: id } });
      if (existing && existing.updatedAt.toISOString() !== expected) {
        throw new JsonPayloadConflictError({
          stored: true,
          payload: asObject(existing.payload),
          updatedAt: existing.updatedAt.toISOString(),
        });
      }
    }
    await delegate.upsert({
      where: { [idField]: id },
      create: { [idField]: id, payload: body },
      update: { payload: body },
    });
    return get(id);
  }

  return { get, put };
}
