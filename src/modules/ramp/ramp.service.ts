import type { Request } from "express";
import { getPrisma } from "../../lib/prisma.js";
import { buildCareCardSvg, rampCareCardAssetUrl } from "./ramp-care-card.js";
import { RAMP_DEMO_PROFILE, buildCareCardSms, buildDemoCaption } from "./ramp-demo-profile.js";
import {
  mintRampToken,
  normalizeProducts,
  normalizeStatus,
  rampMemoryStore,
} from "./ramp-memory.store.js";
import { rampLandingUrl, sendRampSms } from "./ramp-sms.js";
import type {
  FireCareCardRequest,
  FireCareCardResponse,
  RampDemoPostDto,
  StoreSharedSelfieRequest,
} from "./ramp.types.js";

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

export const rampService = {
  fireCareCard: async (
    req: Request,
    body: FireCareCardRequest,
  ): Promise<FireCareCardResponse> => {
    const recipientPhone = String(body.recipientPhone || "").trim();
    if (!recipientPhone) throw new Error("recipientPhone is required");

    const brandSlug = String(body.brandSlug || RAMP_DEMO_PROFILE.brandSlug).trim();
    const recipientName = String(body.recipientName || "").trim();
    const stylistName = String(body.stylistName || RAMP_DEMO_PROFILE.stylistName).trim();
    const products = normalizeProducts(body.products);
    const token = mintRampToken();
    const landingUrl = rampLandingUrl(req, token);
    const careCardUrl = rampCareCardAssetUrl(req, token);
    const caption = buildDemoCaption({ recipientName, stylistName, products });
    const messagePreview = buildCareCardSms({ recipientName, stylistName, landingUrl });

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
            status: "care_sent",
            sourceType: "client_care",
            careCardUrl,
            caption,
          },
        });
        await recordVisitDb(token, "care_card_fired", { brandSlug, recipientPhone });
      } catch (e) {
        const code = e && typeof e === "object" && "code" in e ? String((e as { code?: string }).code) : "";
        if (code !== "P2021") throw e;
        console.warn("[ramp] RampDemoPost table missing — using in-memory store");
        rampMemoryStore.createPost({
          token,
          brandSlug,
          recipientPhone,
          recipientName,
          stylistName,
          products,
          status: "care_sent",
          sourceType: "client_care",
          careCardUrl,
          compositeUrl: null,
          caption,
          landingUrl,
        });
        rampMemoryStore.recordVisit(token, "care_card_fired", { brandSlug, recipientPhone });
      }
    } else {
      rampMemoryStore.createPost({
        token,
        brandSlug,
        recipientPhone,
        recipientName,
        stylistName,
        products,
        status: "care_sent",
        sourceType: "client_care",
        careCardUrl,
        compositeUrl: null,
        caption,
        landingUrl,
      });
      rampMemoryStore.recordVisit(token, "care_card_fired", { brandSlug, recipientPhone });
    }

    const sms = await sendRampSms({
      to: recipientPhone,
      body: messagePreview,
      mediaUrl: careCardUrl,
    });

    return {
      ok: true,
      token,
      landingUrl,
      careCardUrl,
      sent: sms.sent,
      smsMode: sms.mock ? "mock" : "twilio",
      ...(sms.mock ? { mock: true } : {}),
      messagePreview,
    };
  },

  getCareCardSvg: async (token: string): Promise<string | null> => {
    const t = String(token || "").trim().replace(/\.svg$/i, "");
    if (!t) return null;

    const prisma = getPrisma();
    if (prisma) {
      const row = await prisma.rampDemoPost.findUnique({ where: { token: t } });
      if (!row) return null;
      return buildCareCardSvg({
        recipientName: row.recipientName,
        stylistName: row.stylistName,
        products: normalizeProducts(row.products),
      });
    }

    const row = rampMemoryStore.getPost(t);
    if (!row) return null;
    return buildCareCardSvg({
      recipientName: row.recipientName,
      stylistName: row.stylistName,
      products: row.products,
    });
  },

  getPostByToken: async (req: Request, token: string): Promise<RampDemoPostDto | null> => {
    const t = String(token || "").trim();
    if (!t) return null;

    const prisma = getPrisma();
    if (prisma) {
      const row = await prisma.rampDemoPost.findUnique({ where: { token: t } });
      if (!row) return null;
      await recordVisitDb(t, "landing_view");
      return dtoFromRow({
        ...row,
        landingUrl: rampLandingUrl(req, row.token),
      });
    }

    const row = rampMemoryStore.getPost(t);
    if (!row) return null;
    rampMemoryStore.recordVisit(t, "landing_view");
    return dtoFromMemory(row);
  },

  storeSharedSelfie: async (body: StoreSharedSelfieRequest) => {
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
          source: String(body.source || "web_upload").trim() || "web_upload",
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
        });

      const updated = await prisma.rampDemoPost.update({
        where: { token },
        data: {
          status: "ready",
          compositeUrl: mediaUrl,
          caption,
        },
      });

      await recordVisitDb(token, "selfie_stored", { mediaUrl });

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
      source: String(body.source || "web_upload").trim() || "web_upload",
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
      });

    rampMemoryStore.updatePost(token, {
      status: "ready",
      compositeUrl: mediaUrl,
      caption,
    });
    rampMemoryStore.recordVisit(token, "selfie_stored", { mediaUrl });

    return {
      ok: true as const,
      token,
      status: "ready",
      compositeUrl: mediaUrl,
      caption,
    };
  },

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
    const rows = rampMemoryStore.listRecent(cap);
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
