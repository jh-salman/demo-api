import type { NextFunction, Request, Response } from "express";
import type { Salon } from "@prisma/client";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth.js";
import {
  LEGACY_SALON_ID,
  resolveActiveSalon,
  resolveTenantSalonId,
} from "../lib/tenant.js";

export type AuthedRequest = Request & {
  authSession?: Awaited<ReturnType<typeof auth.api.getSession>>;
  /** Active org salon, when linked. */
  salon?: Salon | null;
  /** Tenant key for catalogs / appointments / toolbar / ramp. */
  salonId?: string;
};

export async function requireSession(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.authSession = session;
    next();
  } catch (e) {
    next(e);
  }
}

export async function requireOrg(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const session =
      req.authSession ||
      (await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }));
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.authSession = session;
    const orgId = session.session.activeOrganizationId;
    if (!orgId) {
      res.status(403).json({ error: "No active organization" });
      return;
    }
    next();
  } catch (e) {
    next(e);
  }
}

/**
 * Soft tenant attach: cookies → active org salon id, else legacy `"default"`.
 * Does not 401 — keeps public/legacy callers working until fully gated.
 */
export async function attachTenant(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction,
) {
  try {
    if (!req.authSession) {
      req.authSession = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });
    }
    const salon = await resolveActiveSalon(req.authSession);
    req.salon = salon;
    req.salonId = salon?.id || (await resolveTenantSalonId(req.authSession));
    if (!req.salonId) req.salonId = LEGACY_SALON_ID;
    next();
  } catch (e) {
    next(e);
  }
}

/**
 * Hard tenant: session + active org + linked Salon required.
 * Use for org-owned data (clients, etc.).
 */
export async function requireActiveSalon(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const session =
      req.authSession ||
      (await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }));
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.authSession = session;
    if (!session.session.activeOrganizationId) {
      res.status(403).json({
        error: "No active organization",
        code: "NO_ORG",
      });
      return;
    }
    const salon = await resolveActiveSalon(session);
    if (!salon) {
      res.status(403).json({
        error: "No salon for organization",
        code: "NO_SALON",
      });
      return;
    }
    req.salon = salon;
    req.salonId = salon.id;
    next();
  } catch (e) {
    next(e);
  }
}
