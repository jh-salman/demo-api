import type { Request, Response, NextFunction } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../../lib/auth.js";
import { getPrisma } from "../../lib/prisma.js";
import { seedSalonCatalogs } from "../../lib/ensure-default-catalog.js";
import {
  isValidSlug,
  normalizeSlug,
  getTemplate,
} from "../microsite/microsite.templates.js";
import { salonToPublic } from "../microsite/microsite.service.js";

async function createOrgAndSalon(opts: {
  headers: Headers;
  userPhone?: string | null;
  name: string;
  slug: string;
}) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DATABASE_UNAVAILABLE");

  const slugTaken =
    (await prisma.organization.findUnique({ where: { slug: opts.slug } })) ||
    (await prisma.salon.findUnique({ where: { slug: opts.slug } }));
  if (slugTaken) {
    const err = new Error("SLUG_TAKEN") as Error & { slug: string };
    err.slug = opts.slug;
    throw err;
  }

  const org = await auth.api.createOrganization({
    body: { name: opts.name, slug: opts.slug },
    headers: opts.headers,
  });

  if (!org || !("id" in org)) {
    throw new Error("ORG_CREATE_FAILED");
  }

  const template = getTemplate("sx-book-v1");
  if (!template) throw new Error("TEMPLATE_MISSING");

  const salon = await prisma.salon.create({
    data: {
      organizationId: org.id,
      name: opts.name,
      slug: opts.slug,
      templateId: template.id,
      primaryHex: template.defaults.primaryHex,
      tagline: template.defaults.tagline,
      about: template.defaults.about,
      bookingHours: template.defaults.bookingHours,
      micrositeEnabled: true,
      phone: opts.userPhone || null,
    },
  });

  await seedSalonCatalogs(salon.id);

  await auth.api.setActiveOrganization({
    body: { organizationId: org.id },
    headers: opts.headers,
  });

  return { org, salon };
}

/** POST /api/auth-app/onboard — first org + salon (no-op if already a member). */
export async function postOnboard(
  req: Request,
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

    const prisma = getPrisma();
    if (!prisma) {
      res.status(503).json({ error: "Database unavailable" });
      return;
    }

    const existing = await prisma.member.findFirst({
      where: { userId: session.user.id },
      include: { organization: true },
    });
    if (existing) {
      const salon = await prisma.salon.findUnique({
        where: { organizationId: existing.organizationId },
      });
      if (!session.session.activeOrganizationId) {
        await auth.api.setActiveOrganization({
          body: { organizationId: existing.organizationId },
          headers: fromNodeHeaders(req.headers),
        });
      }
      res.json({
        organization: existing.organization,
        salon: salon ? salonToPublic(salon) : null,
        alreadyOnboarded: true,
      });
      return;
    }

    const name = String(req.body?.name || "").trim() || "My Salon";
    let slug = normalizeSlug(String(req.body?.slug || name));
    if (!isValidSlug(slug)) {
      res.status(400).json({ error: "Invalid slug" });
      return;
    }

    try {
      const { org, salon } = await createOrgAndSalon({
        headers: fromNodeHeaders(req.headers),
        userPhone: session.user.phoneNumber,
        name,
        slug,
      });
      res.status(201).json({
        organization: org,
        salon: {
          id: salon.id,
          name: salon.name,
          slug: salon.slug,
          organizationId: salon.organizationId,
        },
        alreadyOnboarded: false,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "SLUG_TAKEN") {
        res.status(409).json({
          error: "Slug unavailable",
          slug: (e as Error & { slug?: string }).slug,
        });
        return;
      }
      if (msg === "DATABASE_UNAVAILABLE") {
        res.status(503).json({ error: "Database unavailable" });
        return;
      }
      throw e;
    }
  } catch (e) {
    next(e);
  }
}

/**
 * POST /api/auth-app/organizations — create another org + salon (Settings).
 * Always creates a new membership; sets it active.
 */
export async function postCreateOrganization(
  req: Request,
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

    const name = String(req.body?.name || "").trim() || "My Salon";
    let slug = normalizeSlug(String(req.body?.slug || name));
    if (!isValidSlug(slug)) {
      res.status(400).json({ error: "Invalid slug" });
      return;
    }

    try {
      const { org, salon } = await createOrgAndSalon({
        headers: fromNodeHeaders(req.headers),
        userPhone: session.user.phoneNumber,
        name,
        slug,
      });
      res.status(201).json({
        organization: org,
        salon: {
          id: salon.id,
          name: salon.name,
          slug: salon.slug,
          organizationId: salon.organizationId,
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "SLUG_TAKEN") {
        res.status(409).json({
          error: "Slug unavailable",
          slug: (e as Error & { slug?: string }).slug,
        });
        return;
      }
      if (msg === "DATABASE_UNAVAILABLE") {
        res.status(503).json({ error: "Database unavailable" });
        return;
      }
      throw e;
    }
  } catch (e) {
    next(e);
  }
}

/** POST /api/auth-app/switch-organization — set active org on session. */
export async function postSwitchOrganization(
  req: Request,
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

    const organizationId = String(req.body?.organizationId || "").trim();
    if (!organizationId) {
      res.status(400).json({ error: "organizationId required" });
      return;
    }

    const prisma = getPrisma();
    if (!prisma) {
      res.status(503).json({ error: "Database unavailable" });
      return;
    }

    const member = await prisma.member.findFirst({
      where: { userId: session.user.id, organizationId },
    });
    if (!member) {
      res.status(403).json({ error: "Not a member of this organization" });
      return;
    }

    await auth.api.setActiveOrganization({
      body: { organizationId },
      headers: fromNodeHeaders(req.headers),
    });

    const salon = await prisma.salon.findUnique({ where: { organizationId } });
    res.json({
      ok: true,
      organizationId,
      salon: salon ? salonToPublic(salon) : null,
    });
  } catch (e) {
    next(e);
  }
}

/** GET /api/auth-app/me — session + memberships + active salon */
export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const prisma = getPrisma();
    if (!prisma) {
      res.status(503).json({ error: "Database unavailable" });
      return;
    }
    const members = await prisma.member.findMany({
      where: { userId: session.user.id },
      include: { organization: true },
    });
    const orgIds = members.map((m) => m.organizationId);
    const salons = orgIds.length
      ? await prisma.salon.findMany({ where: { organizationId: { in: orgIds } } })
      : [];
    let activeOrgId = session.session.activeOrganizationId;
    if (!activeOrgId && members[0]) {
      await auth.api.setActiveOrganization({
        body: { organizationId: members[0].organizationId },
        headers: fromNodeHeaders(req.headers),
      });
      activeOrgId = members[0].organizationId;
    }
    const activeSalon =
      salons.find((s) => s.organizationId === activeOrgId) || null;

    res.json({
      user: session.user,
      session: {
        ...session.session,
        activeOrganizationId: activeOrgId,
      },
      members,
      salons: salons.map(salonToPublic),
      activeSalon: activeSalon ? salonToPublic(activeSalon) : null,
      otpMock:
        String(process.env.AUTH_OTP_MOCK || "true").toLowerCase() === "true",
      mockOtpCode:
        String(process.env.AUTH_OTP_MOCK || "true").toLowerCase() === "true"
          ? String(process.env.AUTH_MOCK_OTP_CODE || "123456")
          : undefined,
    });
  } catch (e) {
    next(e);
  }
}

/**
 * POST /api/auth-app/accept-invite — link-based invitation accept.
 *
 * The email invite link is treated as the capability token: any signed-in user
 * who opens it joins the invitation's organization (phone-first sign-in means
 * the account email won't match the invited email, so we skip that check).
 * Adds membership, marks the invite accepted, and sets it as the active org.
 */
export async function postAcceptInvite(
  req: Request,
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
    const prisma = getPrisma();
    if (!prisma) {
      res.status(503).json({ error: "Database unavailable" });
      return;
    }

    const invitationId = String(req.body?.invitationId || "").trim();
    if (!invitationId) {
      res.status(400).json({ error: "invitationId is required" });
      return;
    }

    const invite = await prisma.invitation.findUnique({
      where: { id: invitationId },
    });
    if (!invite) {
      res.status(404).json({ error: "Invitation not found" });
      return;
    }
    if (invite.status !== "pending") {
      res
        .status(409)
        .json({ error: "Invitation already used", code: "NOT_PENDING" });
      return;
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      await prisma.invitation
        .update({ where: { id: invitationId }, data: { status: "expired" } })
        .catch(() => undefined);
      res.status(410).json({ error: "Invitation expired", code: "EXPIRED" });
      return;
    }

    const userId = session.user.id;
    const existingMember = await prisma.member.findUnique({
      where: {
        organizationId_userId: { organizationId: invite.organizationId, userId },
      },
    });
    if (!existingMember) {
      await prisma.member.create({
        data: {
          organizationId: invite.organizationId,
          userId,
          role: invite.role || "member",
        },
      });
    }

    await prisma.invitation.update({
      where: { id: invitationId },
      data: { status: "accepted" },
    });

    await auth.api.setActiveOrganization({
      body: { organizationId: invite.organizationId },
      headers: fromNodeHeaders(req.headers),
    });

    const organization = await prisma.organization.findUnique({
      where: { id: invite.organizationId },
    });
    const salon = await prisma.salon.findUnique({
      where: { organizationId: invite.organizationId },
    });

    res.json({
      ok: true,
      organization,
      salon: salon ? salonToPublic(salon) : null,
    });
  } catch (e) {
    next(e);
  }
}
