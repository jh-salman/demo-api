import { randomUUID } from "node:crypto";
import { getPrisma } from "./prisma.js";
import { digitsOnlyPhone, normalizePhoneE164 } from "./us-phone.js";
import { clientsService } from "../modules/clients/clients.service.js";
import { emitClientsCatalogUpdated } from "../realtime/io.js";

type ClientRow = Record<string, unknown> & {
  id?: string;
  name?: string;
  phone?: string;
};

function phoneMatches(rowPhone: unknown, targetDigits: string, targetE164: string | null): boolean {
  const rowDigits = digitsOnlyPhone(String(rowPhone || ""));
  if (!rowDigits) return false;
  if (targetE164) {
    const rowE164 = normalizePhoneE164(String(rowPhone || ""));
    if (rowE164 && rowE164 === targetE164) return true;
  }
  return rowDigits === targetDigits;
}

/**
 * Ensure a client exists in the salon catalog for this phone number.
 * Match key is the phone (US-normalized). Existing match is returned unchanged
 * (name is preserved). Best-effort: never throws — booking must not fail if the
 * catalog write races or the DB is unavailable.
 */
export async function upsertClientByPhone(
  salonId: string,
  input: { name: string; phone: string; email?: string; source?: string },
): Promise<{ created: boolean; client: ClientRow | null }> {
  const prisma = getPrisma();
  if (!prisma) return { created: false, client: null };

  const targetDigits = digitsOnlyPhone(input.phone);
  if (!targetDigits) return { created: false, client: null };
  const targetE164 = normalizePhoneE164(input.phone);

  try {
    const current = await clientsService.get(salonId);
    const list = (Array.isArray(current.clients) ? current.clients : []) as ClientRow[];

    const existing = list.find((c) => phoneMatches(c?.phone, targetDigits, targetE164));
    if (existing) return { created: false, client: existing };

    const newClient: ClientRow = {
      id: `c-${randomUUID().slice(0, 8)}`,
      name: input.name.trim() || "Client",
      phone: targetE164 || input.phone.trim(),
      email: input.email?.trim() || "",
      notes: "",
      source: input.source || "Microsite",
      createdAt: new Date().toISOString(),
    };

    const saved = await clientsService.put(
      [...list, newClient],
      (current as { updatedAt?: string }).updatedAt ?? null,
      salonId,
    );

    emitClientsCatalogUpdated({
      stored: true,
      clients: saved.clients,
      ...(saved.updatedAt ? { updatedAt: saved.updatedAt } : {}),
    });

    return { created: true, client: newClient };
  } catch {
    return { created: false, client: null };
  }
}
