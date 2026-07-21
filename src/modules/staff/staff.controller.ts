import type { Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { HttpError } from "../../middleware/error.middleware.js";
import { JsonRowConflictError } from "../../lib/json-row-store.js";
import { getPrisma } from "../../lib/prisma.js";
import { LEGACY_SALON_ID } from "../../lib/tenant.js";
import type { AuthedRequest } from "../../middleware/auth.middleware.js";
import { staffService } from "./staff.service.js";
import type { StaffCatalogItem } from "../../lib/staff-catalog.js";
import { createCatalogCache } from "../../lib/catalog-cache.js";

const staffCache = createCatalogCache("staff:v2");

function salonIdOf(req: AuthedRequest) {
  return req.salonId || LEGACY_SALON_ID;
}

async function memberRole(
  organizationId: string | null | undefined,
  userId: string | null | undefined,
): Promise<string | null> {
  if (!organizationId || !userId) return null;
  const prisma = getPrisma();
  if (!prisma) return null;
  const m = await prisma.member.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { role: true },
  });
  return m?.role ?? null;
}

function isOwnerOrAdmin(role: string | null): boolean {
  const r = String(role || "").toLowerCase();
  return r === "owner" || r === "admin";
}

export const staffController = {
  get: asyncHandler(async (req: AuthedRequest, res: Response) => {
    const salonId = salonIdOf(req);
    res.json(await staffCache.cachedGet(salonId, () => staffService.get(salonId)));
  }),

  put: asyncHandler(async (req: AuthedRequest, res: Response) => {
    const salonId = salonIdOf(req);
    const body = req.body;
    if (!body || typeof body !== "object") {
      throw new HttpError(400, "Expected JSON object");
    }
    const b = body as Record<string, unknown>;
    try {
      const next = await staffService.put(
        b.staff,
        typeof b.expectedUpdatedAt === "string" ? b.expectedUpdatedAt : null,
        salonId,
      );
      await staffCache.invalidate(salonId);
      res.json(next);
    } catch (e) {
      if (e instanceof JsonRowConflictError) {
        res.status(409).json({ error: e.message, ...e.current, staff: e.current.items });
        return;
      }
      const msg = e instanceof Error ? e.message : "Save failed";
      if (msg.includes("DATABASE_URL")) {
        throw new HttpError(503, "Database not configured");
      }
      throw new HttpError(500, msg);
    }
  }),

  /**
   * PATCH /api/staff/:id/schedule
   * Owner/admin: always. Member: only own row when canSelfManage.
   */
  patchSchedule: asyncHandler(async (req: AuthedRequest, res: Response) => {
    const salonId = salonIdOf(req);
    const staffId = String(req.params.id || "").trim();
    if (!staffId) throw new HttpError(400, "staff id required");

    const session = req.authSession;
    const userId = session?.user?.id;
    if (!userId) throw new HttpError(401, "Unauthorized");

    const orgId =
      session?.session?.activeOrganizationId ||
      req.salon?.organizationId ||
      null;
    const role = await memberRole(orgId, userId);
    const ownerAdmin = isOwnerOrAdmin(role);

    const current = await staffService.get(salonId);
    const list = (Array.isArray(current.staff)
      ? current.staff
      : []) as StaffCatalogItem[];
    const item = list.find((s) => String(s.id) === staffId);
    if (!item) throw new HttpError(404, "Staff not found");

    if (!ownerAdmin) {
      if (String(item.userId || "") !== userId) {
        throw new HttpError(403, "Not your schedule");
      }
      if (!item.canSelfManage) {
        throw new HttpError(403, "Self-manage not granted by owner");
      }
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const patch: {
      workingHours?: unknown;
      breaks?: unknown;
      canSelfManage?: boolean;
    } = {};
    if (body.workingHours !== undefined) patch.workingHours = body.workingHours;
    if (body.breaks !== undefined) patch.breaks = body.breaks;
    // Only owners/admins may flip the grant flag.
    if (ownerAdmin && body.canSelfManage !== undefined) {
      patch.canSelfManage = Boolean(body.canSelfManage);
    }

    try {
      const next = await staffService.patchSchedule(
        salonId,
        staffId,
        patch,
        typeof body.expectedUpdatedAt === "string"
          ? body.expectedUpdatedAt
          : null,
      );
      await staffCache.invalidate(salonId);
      res.json(next);
    } catch (e) {
      if (e instanceof JsonRowConflictError) {
        res.status(409).json({ error: e.message, ...e.current, staff: e.current.items });
        return;
      }
      const status = (e as { status?: number })?.status;
      if (status === 404) throw new HttpError(404, "Staff not found");
      const msg = e instanceof Error ? e.message : "Save failed";
      if (msg.includes("DATABASE_URL")) {
        throw new HttpError(503, "Database not configured");
      }
      throw new HttpError(500, msg);
    }
  }),
};
