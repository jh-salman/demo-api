import { HttpError } from "../middleware/error.middleware.js";
import type { AuthedRequest } from "../middleware/auth.middleware.js";
import { getPrisma } from "./prisma.js";
import { LEGACY_SALON_ID } from "./tenant.js";
import { staffService } from "../modules/staff/staff.service.js";

type AppointmentRow = {
  staffId: string | null;
};

export type ViewerContext = {
  userId: string;
  orgId: string | null;
  role: string | null;
  ownerAdmin: boolean;
  viewerStaffId: string | null;
};

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

export function isOwnerOrAdmin(role: string | null): boolean {
  const r = String(role || "").toLowerCase();
  return r === "owner" || r === "admin";
}

/** Resolve org role + linked staff catalog row for the signed-in viewer. */
export async function getViewerContext(
  req: AuthedRequest,
): Promise<ViewerContext | null> {
  const userId = req.authSession?.user?.id;
  if (!userId) return null;

  const orgId =
    req.authSession?.session?.activeOrganizationId ||
    req.salon?.organizationId ||
    null;
  const role = await memberRole(orgId, userId);
  const ownerAdmin = isOwnerOrAdmin(role);

  const salonId = req.salonId || LEGACY_SALON_ID;
  let viewerStaffId: string | null = null;
  try {
    const catalog = await staffService.get(salonId);
    const list = Array.isArray(catalog.staff) ? catalog.staff : [];
    const mine = list.find(
      (s) =>
        s &&
        typeof s === "object" &&
        String((s as { userId?: string }).userId || "") === userId,
    ) as { id?: string } | undefined;
    viewerStaffId = mine?.id ? String(mine.id) : null;
  } catch {
    viewerStaffId = null;
  }

  return { userId, orgId, role, ownerAdmin, viewerStaffId };
}

export async function requireViewerContext(
  req: AuthedRequest,
): Promise<ViewerContext> {
  const ctx = await getViewerContext(req);
  if (!ctx) throw new HttpError(401, "Unauthorized");
  return ctx;
}

function appointmentStaffId(apt: AppointmentRow | null | undefined): string | null {
  if (!apt) return null;
  return apt.staffId ? String(apt.staffId) : null;
}

/** Stylist (member) may only touch appointments on their own staff column. */
export function assertCanReadAppointment(
  apt: AppointmentRow,
  ctx: ViewerContext,
): void {
  if (ctx.ownerAdmin) return;
  const sid = appointmentStaffId(apt);
  if (!ctx.viewerStaffId || sid !== ctx.viewerStaffId) {
    throw new HttpError(403, "Not your appointment");
  }
}

export function assertCanMutateAppointment(
  apt: AppointmentRow,
  ctx: ViewerContext,
): void {
  assertCanReadAppointment(apt, ctx);
}

/** On create: members must book on their own staffId (or get one auto-assigned). */
export function resolveCreateStaffId(
  requested: string | null,
  ctx: ViewerContext,
): string | null {
  if (ctx.ownerAdmin) return requested;
  if (!ctx.viewerStaffId) {
    throw new HttpError(
      403,
      "Your account is not linked to a stylist profile",
    );
  }
  if (requested && requested !== ctx.viewerStaffId) {
    throw new HttpError(403, "Cannot assign appointments to other stylists");
  }
  return ctx.viewerStaffId;
}

/** On patch: members cannot reassign to another stylist. */
export function assertPatchStaffId(
  nextStaffId: string | null | undefined,
  ctx: ViewerContext,
): void {
  if (ctx.ownerAdmin || nextStaffId === undefined) return;
  if (nextStaffId !== null && nextStaffId !== ctx.viewerStaffId) {
    throw new HttpError(403, "Cannot assign appointments to other stylists");
  }
}

export function filterAppointmentsForViewer(
  list: AppointmentRow[],
  ctx: ViewerContext,
): AppointmentRow[] {
  if (ctx.ownerAdmin) return list;
  if (!ctx.viewerStaffId) return [];
  return list.filter((a) => appointmentStaffId(a) === ctx.viewerStaffId);
}
