import type { Request } from "express";
import { getPrisma } from "../../lib/prisma.js";
import { buildDemoCaption } from "./ramp-demo-profile.js";
import {
  mintRampToken,
  normalizeProducts,
  normalizeStatus,
  rampMemoryStore,
} from "./ramp-memory.store.js";
import { RAMP_DEMO_PROFILE } from "./ramp-demo-profile.js";
import { rampLandingUrl } from "./ramp-sms.js";
import type {
  RampDemoPostDto,
  StartStylistPostRequest,
  StartStylistPostResponse,
  StoreSharedSelfieRequest,
} from "./ramp.types.js";

const RAMP_POST_STATUSES = new Set(["ready", "posted"]);

function isRampPostReady(status: string | null | undefined): boolean {
  return RAMP_POST_STATUSES.has(normalizeStatus(status));
}

function dtoFromRow(row: {
  token: string;
  brandSlug: string;
  recipientPhone: string;
  recipientName: string;
  stylistName: string;
  products: unknown;
  status: string;
  sourceType: string;
  careCardUrl: string | null;
  compositeUrl: string | null;
  caption: string | null;
  createdAt: Date;
  updatedAt: Date;
  landingUrl: string;
}): RampDemoPostDto {
  return {
    token: row.token,
    brandSlug: row.brandSlug,
    recipientPhone: row.recipientPhone,
    recipientName: row.recipientName,
    stylistName: row.stylistName,
    products: normalizeProducts(row.products),
    status: normalizeStatus(row.status),
    sourceType: row.sourceType,
    careCardUrl: row.careCardUrl,
    compositeUrl: row.compositeUrl,
    caption: row.caption,
    landingUrl: row.landingUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function dtoFromMemory(row: ReturnType<typeof rampMemoryStore.getPost>): RampDemoPostDto | null {
  if (!row) return null;
  return {
    token: row.token,
    brandSlug: row.brandSlug,
    recipientPhone: row.recipientPhone,
    recipientName: row.recipientName,
    stylistName: row.stylistName,
    products: normalizeProducts(row.products),
    status: normalizeStatus(row.status),
    sourceType: row.sourceType,
    careCardUrl: row.careCardUrl,
    compositeUrl: row.compositeUrl,
    caption: row.caption,
    landingUrl: row.landingUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function recordVisitDb(token: string, eventType: string, metadata?: unknown) {
  const prisma = getPrisma();
  if (!prisma) {
    rampMemoryStore.recordVisit(token, eventType, metadata);
    return;
  }
  await prisma.rampVisit.create({
    data: {
      token,
      eventType,
      metadataJson: metadata ?? undefined,
    },
  });
}

async function storeSharedSelfieImpl(body: StoreSharedSelfieRequest) {
  const token = String(body.token || "").trim();
  const mediaUrl = String(body.mediaUrl || "").trim();
  if (!token || !mediaUrl) throw new Error("token and mediaUrl are required");

  const prisma = getPrisma();
  if (prisma) {
    const post = await prisma.rampDemoPost.findUnique({ where: { token } });
    if (!post) throw new Error("Unknown RAMP token");

    await prisma.rampSharedAsset.create({
      data: {
        token,
        brandSlug: post.brandSlug,
        source: String(body.source || "stylist_post").trim() || "stylist_post",
        phone: body.phone ? String(body.phone).trim() : null,
        mediaUrl,
        cloudinaryUrl: mediaUrl.includes("cloudinary.com") ? mediaUrl : null,
      },
    });

    const caption =
      post.caption ||
      buildDemoCaption({
        recipientName: post.recipientName,
        stylistName: post.stylistName,
        products: normalizeProducts(post.products),
        postStyle: post.sourceType?.replace(/^ramp_/, ""),
      });

    const updated = await prisma.rampDemoPost.update({
      where: { token },
      data: {
        status: "ready",
        compositeUrl: mediaUrl,
        caption,
      },
    });

    await recordVisitDb(token, "ramp_post_ready", { mediaUrl });

    return {
      ok: true as const,
      token,
      status: updated.status,
      compositeUrl: updated.compositeUrl,
      caption: updated.caption,
    };
  }

  const post = rampMemoryStore.getPost(token);
  if (!post) throw new Error("Unknown RAMP token");

  rampMemoryStore.storeAsset({
    token,
    brandSlug: post.brandSlug,
    source: String(body.source || "stylist_post").trim() || "stylist_post",
    phone: body.phone ? String(body.phone).trim() : null,
    mediaUrl,
    cloudinaryUrl: mediaUrl.includes("cloudinary.com") ? mediaUrl : null,
  });

  const caption =
    post.caption ||
    buildDemoCaption({
      recipientName: post.recipientName,
      stylistName: post.stylistName,
      products: post.products,
      postStyle: post.sourceType?.replace(/^ramp_/, ""),
    });

  rampMemoryStore.updatePost(token, {
    status: "ready",
    compositeUrl: mediaUrl,
    caption,
  });
  rampMemoryStore.recordVisit(token, "ramp_post_ready", { mediaUrl });

  return {
    ok: true as const,
    token,
    status: "ready" as const,
    compositeUrl: mediaUrl,
    caption,
  };
}

function normalizeCaptureType(raw?: string): string {
  const v = String(raw || "photo").trim().toLowerCase();
  if (v === "upload" || v === "reel" || v === "photo") return v;
  return "photo";
}

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => String(t || "").trim())
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeLinks(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((l) => String(l || "").trim())
    .filter(Boolean)
    .slice(0, 4);
}

async function startStylistPostImpl(
  req: Request,
  body: StartStylistPostRequest,
): Promise<StartStylistPostResponse> {
  const token = mintRampToken();
  const brandSlug =
    String(body.brandSlug || RAMP_DEMO_PROFILE.brandSlug).trim() || RAMP_DEMO_PROFILE.brandSlug;
  const recipientName = String(body.recipientName || "").trim();
  const recipientPhone = String(body.recipientPhone || "").trim();
  const stylistName =
    String(body.stylistName || RAMP_DEMO_PROFILE.stylistName).trim() ||
    RAMP_DEMO_PROFILE.stylistName;
  const products = normalizeProducts(body.products);
  const captureType = normalizeCaptureType(body.captureType);
  const postStyle = String(body.postStyle || "new_look").trim().toLowerCase() || "new_look";
  const tags = normalizeTags(body.tags);
  const links = normalizeLinks(body.links);
  const sourceType = `ramp_${captureType}`;
  const landingUrl = rampLandingUrl(req, token);
  const caption = buildDemoCaption({
    recipientName,
    stylistName,
    products,
    postStyle,
    tags,
    links,
  });
  const visitMeta = {
    appointmentId: body.appointmentId ?? null,
    postStyle,
    captureType,
    tags,
    links,
  };

  const prisma = getPrisma();
  if (prisma) {
    try {
      await prisma.rampDemoPost.create({
        data: {
          token,
          brandSlug,
          recipientPhone,
          recipientName,
          stylistName,
          products,
          status: "processing",
          sourceType,
          caption,
        },
      });
      await recordVisitDb(token, "ramp_bolt_start", visitMeta);
      return { ok: true, token, landingUrl, status: "processing" };
    } catch {
      /* table missing — fall through to memory store */
    }
  }

  rampMemoryStore.createPost({
    token,
    brandSlug,
    recipientPhone,
    recipientName,
    stylistName,
    products,
    status: "processing",
    sourceType,
    careCardUrl: null,
    compositeUrl: null,
    caption,
    landingUrl,
  });
  rampMemoryStore.recordVisit(token, "ramp_bolt_start", visitMeta);

  return { ok: true, token, landingUrl, status: "processing" };
}

export const rampService = {
  getPostByToken: async (req: Request, token: string): Promise<RampDemoPostDto | null> => {
    const t = String(token || "").trim();
    if (!t) return null;

    const prisma = getPrisma();
    if (prisma) {
      const row = await prisma.rampDemoPost.findUnique({ where: { token: t } });
      if (!row || !isRampPostReady(row.status) || !row.compositeUrl) return null;
      await recordVisitDb(t, "post_it_view");
      return dtoFromRow({
        ...row,
        landingUrl: rampLandingUrl(req, row.token),
      });
    }

    const row = rampMemoryStore.getPost(t);
    if (!row || !isRampPostReady(row.status) || !row.compositeUrl) return null;
    rampMemoryStore.recordVisit(t, "post_it_view");
    return dtoFromMemory(row);
  },

  storeSharedSelfie: storeSharedSelfieImpl,

  startStylistPost: startStylistPostImpl,

  trackCopy: async (token: string, eventType = "caption_copy") => {
    const t = String(token || "").trim();
    if (!t) throw new Error("token is required");
    await recordVisitDb(t, eventType);
    return { ok: true as const, token: t, eventType };
  },

  listRecent: async (limit = 24) => {
    const cap = Math.max(1, Math.min(50, Number(limit) || 24));
    const prisma = getPrisma();
    if (prisma) {
      try {
        const rows = await prisma.rampDemoPost.findMany({
          where: { status: { in: ["ready", "posted"] } },
          orderBy: { updatedAt: "desc" },
          take: cap,
        });
        return {
          items: rows.map((row) => ({
            id: row.id,
            token: row.token,
            title: row.recipientName || row.recipientPhone,
            status: normalizeStatus(row.status),
            createdAt: row.createdAt.toISOString(),
          })),
        };
      } catch {
        /* table missing — fall through to memory store */
      }
    }
    const rows = rampMemoryStore.listRecent(cap).filter((row) => isRampPostReady(row.status));
    return {
      items: rows.map((row) => ({
        id: row.id,
        token: row.token,
        title: row.recipientName || row.recipientPhone,
        status: normalizeStatus(row.status),
        createdAt: row.createdAt,
      })),
    };
  },
};
