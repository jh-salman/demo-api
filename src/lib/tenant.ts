import type { Salon } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import { getIoRedis } from "./ioredis.js";

/** Legacy single-tenant row id used before org scoping. */
export const LEGACY_SALON_ID = "default";

export type SessionLike = {
  user?: { id?: string | null } | null;
  session: { activeOrganizationId?: string | null };
};

/**
 * Per-org salon lookup cached in Redis. An org's salon id is stable, so this
 * removes a DB round-trip from every authenticated organization/staff request.
 * Cache is busted on salon create/update via `invalidateSalonCache`.
 *
 * Note: consumers only read `salon.id` / `salon.organizationId` (both strings),
 * so JSON round-tripping Date fields is safe here.
 */
const SALON_NS = "salonx:tenant:orgsalon:";
const SALON_TTL_SECONDS = 600;

async function salonByOrg(orgId: string): Promise<Salon | null> {
  const prisma = getPrisma();
  if (!prisma) return null;
  const redis = getIoRedis();
  if (redis) {
    try {
      const hit = await redis.get(SALON_NS + orgId);
      if (hit) return JSON.parse(hit) as Salon;
    } catch {
      /* fall through to DB */
    }
  }
  const salon = await prisma.salon.findUnique({
    where: { organizationId: orgId },
  });
  if (salon && redis) {
    try {
      await redis.set(SALON_NS + orgId, JSON.stringify(salon), "EX", SALON_TTL_SECONDS);
    } catch {
      /* best effort */
    }
  }
  return salon;
}

/** Drop the cached salon for an org after a salon create/update. */
export async function invalidateSalonCache(
  orgId: string | null | undefined,
): Promise<void> {
  if (!orgId) return;
  const redis = getIoRedis();
  if (!redis) return;
  try {
    await redis.del(SALON_NS + orgId);
  } catch {
    /* ignore */
  }
}

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
    const active = await salonByOrg(orgId);
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
    const salon = await salonByOrg(m.organizationId);
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
