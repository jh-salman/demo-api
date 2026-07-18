import { getPrisma } from "../../lib/prisma.js";
import { createJsonPayloadStore } from "../../lib/json-payload-store.js";
import { LEGACY_SALON_ID } from "../../lib/tenant.js";

export function normalizeClientKey(name: string): string {
  return (name || "").trim().toLowerCase();
}

/** Scope consultation rows per salon/org (composite storage key). */
export function tenantConsultationKey(
  salonId: string,
  clientKey: string,
): string {
  const sid = salonId || LEGACY_SALON_ID;
  return `${sid}::${clientKey}`;
}

function store() {
  const prisma = getPrisma();
  if (!prisma) return null;
  return createJsonPayloadStore(
    prisma.salonxClientConsultation as unknown as Parameters<
      typeof createJsonPayloadStore
    >[0],
    "clientKey",
  );
}

export const clientConsultationService = {
  get: async (clientKey: string, salonId: string = LEGACY_SALON_ID) => {
    const s = store();
    const key = tenantConsultationKey(salonId, clientKey);
    if (!s) {
      return { stored: false as const, clientKey, record: null };
    }
    const row = await s.get(key);
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
    salonId: string = LEGACY_SALON_ID,
  ) => {
    const s = store();
    if (!s) throw new Error("DATABASE_URL not configured");
    const key = tenantConsultationKey(salonId, clientKey);
    const row = await s.put(key, record, { expectedUpdatedAt });
    return {
      stored: row.stored,
      clientKey,
      record: row.payload,
      ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}),
    };
  },
};
