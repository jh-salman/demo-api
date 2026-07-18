import type { Salon } from "@prisma/client";
import { getPrisma } from "./prisma.js";

/** Legacy single-tenant row id used before org scoping. */
export const LEGACY_SALON_ID = "default";

export type SessionLike = {
  session: { activeOrganizationId?: string | null };
};

/** Resolve Salon for the session's active organization. */
export async function resolveActiveSalon(
  session: SessionLike | null | undefined,
): Promise<Salon | null> {
  const orgId = session?.session?.activeOrganizationId;
  if (!orgId) return null;
  const prisma = getPrisma();
  if (!prisma) return null;
  return prisma.salon.findUnique({ where: { organizationId: orgId } });
}

/**
 * Catalog / appointment / toolbar tenant key:
 * active org's salon id, else legacy `"default"`.
 */
export async function resolveTenantSalonId(
  session: SessionLike | null | undefined,
): Promise<string> {
  const salon = await resolveActiveSalon(session);
  return salon?.id || LEGACY_SALON_ID;
}
