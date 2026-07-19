import type { Salon } from "@prisma/client";
import { getPrisma } from "./prisma.js";

/** Legacy single-tenant row id used before org scoping. */
export const LEGACY_SALON_ID = "default";

export type SessionLike = {
  user?: { id?: string | null } | null;
  session: { activeOrganizationId?: string | null };
};

/**
 * Resolve Salon for the session.
 * Prefers the active organization; if none is set, auto-selects the user's
 * first membership org that has a salon. This keeps appointment/catalog writes
 * on the real salon id (matching microsite bookings) instead of leaking to the
 * legacy `"default"` tenant when the session has no active org yet.
 */
export async function resolveActiveSalon(
  session: SessionLike | null | undefined,
): Promise<Salon | null> {
  const prisma = getPrisma();
  if (!prisma) return null;

  const orgId = session?.session?.activeOrganizationId;
  if (orgId) {
    const active = await prisma.salon.findUnique({
      where: { organizationId: orgId },
    });
    if (active) return active;
  }

  const userId = session?.user?.id;
  if (!userId) return null;

  const memberships = await prisma.member.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { organizationId: true },
  });
  for (const m of memberships) {
    const salon = await prisma.salon.findUnique({
      where: { organizationId: m.organizationId },
    });
    if (salon) return salon;
  }
  return null;
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
