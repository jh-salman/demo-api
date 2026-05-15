import { getPrisma } from "../../lib/prisma.js";
import { createJsonPayloadStore } from "../../lib/json-payload-store.js";

export function normalizeClientKey(name: string): string {
  return (name || "").trim().toLowerCase();
}

function store() {
  const prisma = getPrisma();
  if (!prisma) return null;
  return createJsonPayloadStore(
    prisma.salonxClientConsultation as unknown as Parameters<typeof createJsonPayloadStore>[0],
    "clientKey",
  );
}

export const clientConsultationService = {
  get: async (clientKey: string) => {
    const s = store();
    if (!s) {
      return { stored: false as const, clientKey, record: null };
    }
    const row = await s.get(clientKey);
    return {
      stored: row.stored,
      clientKey,
      record: row.payload,
      ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}),
    };
  },
  put: async (
    clientKey: string,
    record: unknown,
    expectedUpdatedAt?: string | null,
  ) => {
    const s = store();
    if (!s) throw new Error("DATABASE_URL not configured");
    const row = await s.put(clientKey, record, { expectedUpdatedAt });
    return {
      stored: row.stored,
      clientKey,
      record: row.payload,
      ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}),
    };
  },
};
