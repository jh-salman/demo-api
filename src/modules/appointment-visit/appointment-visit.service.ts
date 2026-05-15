import { getPrisma } from "../../lib/prisma.js";
import { createJsonPayloadStore } from "../../lib/json-payload-store.js";

function store() {
  const prisma = getPrisma();
  if (!prisma) return null;
  return createJsonPayloadStore(
    prisma.salonxAppointmentVisit as unknown as Parameters<typeof createJsonPayloadStore>[0],
    "appointmentId",
  );
}

export const appointmentVisitService = {
  get: async (appointmentId: string) => {
    const id = String(appointmentId || "").trim();
    const s = store();
    if (!s) {
      return { stored: false as const, appointmentId: id, visit: null };
    }
    const row = await s.get(id);
    return {
      stored: row.stored,
      appointmentId: id,
      visit: row.payload,
      ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}),
    };
  },
  put: async (
    appointmentId: string,
    visit: unknown,
    expectedUpdatedAt?: string | null,
  ) => {
    const id = String(appointmentId || "").trim();
    const s = store();
    if (!s) throw new Error("DATABASE_URL not configured");
    const row = await s.put(id, visit, { expectedUpdatedAt });
    return {
      stored: row.stored,
      appointmentId: id,
      visit: row.payload,
      ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}),
    };
  },
};
