import type { Request } from "express";
import { getPrisma } from "../../lib/prisma.js";
import { requestOrigin } from "../../lib/public-url.js";
import { buildDemoCaption } from "./ramp-demo-profile.js";
import {
  mintRampToken,
  normalizeProducts,
  normalizeStatus,
  rampMemoryStore,
} from "./ramp-memory.store.js";
import { RAMP_DEMO_PROFILE } from "./ramp-demo-profile.js";
import {
  buildClientCareSmsBody,
  buildRampShareSmsBody,
  rampLandingUrl,
  rampPublicBaseUrl,
  sendRampSms,
} from "./ramp-sms.js";
import { generateBrandedRampImage, isOpenAiMockMode } from "./ramp-openai.js";
import { normalizeRampPostStylePreset } from "./ramp-ai-prompts.js";
import { normalizePhone } from "./ramp-phone.js";
import type {
  FireClientCareCardRequest,
  FireClientCareCardResponse,
  RampDemoPostDto,
  RampPostStatus,
  SendRampSmsResponse,
  StartStylistPostRequest,
  StartStylistPostResponse,
  StoreSharedSelfieRequest,
  SubmitRampCaptureResponse,
} from "./ramp.types.js";

const RAMP_POST_STATUSES = new Set(["ready", "posted", "care_sent", "sent"]);
const RAMP_QUEUE_STATUSES = new Set(["pending", "generating", "processing", "ready", "failed"]);
const activeGenerations = new Set<string>();

function isRampPostReady(status: string | null | undefined): boolean {
  return RAMP_POST_STATUSES.has(normalizeStatus(status));
}

function isRampQueueItem(status: string | null | undefined): boolean {
  return RAMP_QUEUE_STATUSES.has(normalizeStatus(status));
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
  if (v === "selfie") return "upload";
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
  const postStyle = normalizeRampPostStylePreset(body.postStyle);
  const capturePath = String(body.capturePath || "stylist_path").trim() || "stylist_path";
  const visualDirection = String(body.visualDirection || "raw").trim() || "raw";
  const imageEdit = String(body.imageEdit || "hair_color_pop").trim() || "hair_color_pop";
  const brandLayer = String(body.brandLayer || "active_brand").trim() || "active_brand";
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
    capturePath,
    visualDirection,
    imageEdit,
    brandLayer,
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

async function updatePostStatus(
  token: string,
  patch: {
    status?: RampPostStatus;
    compositeUrl?: string | null;
    caption?: string | null;
    careCardUrl?: string | null;
    recipientPhone?: string;
  },
) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const updated = await prisma.rampDemoPost.update({
        where: { token },
        data: patch,
      });
      return updated;
    } catch {
      /* fall through */
    }
  }
  rampMemoryStore.updatePost(token, patch);
  return rampMemoryStore.getPost(token);
}

async function readBoltStartPromptMeta(
  token: string,
): Promise<Record<string, unknown> | null> {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const visit = await prisma.rampVisit.findFirst({
        where: { token, eventType: "ramp_bolt_start" },
        orderBy: { createdAt: "desc" },
      });
      if (visit?.metadataJson && typeof visit.metadataJson === "object") {
        return visit.metadataJson as Record<string, unknown>;
      }
    } catch {
      /* fall through */
    }
  }
  return rampMemoryStore.getVisitMetadata(token, "ramp_bolt_start");
}

type RampGenerationOverrides = {
  visualDirection?: string;
  imageEdit?: string;
  extraNote?: string;
};

async function runGenerationJob(
  req: Request,
  token: string,
  rawMediaUrl: string,
  overrides?: RampGenerationOverrides,
) {
  if (activeGenerations.has(token)) return;
  activeGenerations.add(token);
  try {
    await updatePostStatus(token, { status: "generating" });
    await recordVisitDb(token, "ramp_generate_start", { rawMediaUrl });

    if (isOpenAiMockMode()) {
      await new Promise((resolve) => setTimeout(resolve, 1800));
    }

    const prisma = getPrisma();
    let postRow: {
      recipientName: string;
      stylistName: string;
      products: unknown;
      sourceType: string;
      brandSlug: string;
      caption: string | null;
    } | null = null;

    if (prisma) {
      try {
        postRow = await prisma.rampDemoPost.findUnique({ where: { token } });
      } catch {
        postRow = null;
      }
    }
    if (!postRow) {
      const mem = rampMemoryStore.getPost(token);
      if (!mem) throw new Error("Unknown RAMP token");
      postRow = mem;
    }

    const postStyle = normalizeRampPostStylePreset(
      String(postRow.sourceType || "ramp_photo").replace(/^ramp_/, "") || "curiosity",
    );
    const promptMeta = (await readBoltStartPromptMeta(token)) || {};
    const { imageUrl, mock } = await generateBrandedRampImage({
      sourceImageUrl: rawMediaUrl,
      postStyle,
      recipientName: postRow.recipientName,
      stylistName: postRow.stylistName,
      brandSlug: postRow.brandSlug,
      reqOrigin: requestOrigin(req),
      capturePath: typeof promptMeta.capturePath === "string" ? promptMeta.capturePath : undefined,
      visualDirection:
        overrides?.visualDirection ||
        (typeof promptMeta.visualDirection === "string" ? promptMeta.visualDirection : undefined),
      imageEdit:
        overrides?.imageEdit ||
        (typeof promptMeta.imageEdit === "string" ? promptMeta.imageEdit : undefined),
      brandLayer: typeof promptMeta.brandLayer === "string" ? promptMeta.brandLayer : undefined,
      captureType: typeof promptMeta.captureType === "string" ? promptMeta.captureType : undefined,
      extraNote: overrides?.extraNote,
    });

    const caption =
      postRow.caption ||
      buildDemoCaption({
        recipientName: postRow.recipientName,
        stylistName: postRow.stylistName,
        products: normalizeProducts(postRow.products),
        postStyle,
      });

    await updatePostStatus(token, {
      status: "ready",
      compositeUrl: imageUrl,
      caption,
      careCardUrl: rawMediaUrl,
    });
    await recordVisitDb(token, "ramp_generate_ready", { imageUrl, mock });
  } catch (e) {
    await updatePostStatus(token, { status: "failed" });
    await recordVisitDb(token, "ramp_generate_failed", {
      error: e instanceof Error ? e.message : "generation failed",
    });
  } finally {
    activeGenerations.delete(token);
  }
}

async function submitRampCaptureImpl(
  req: Request,
  body: StoreSharedSelfieRequest,
): Promise<SubmitRampCaptureResponse> {
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

    await prisma.rampDemoPost.update({
      where: { token },
      data: {
        status: "pending",
        compositeUrl: null,
        careCardUrl: mediaUrl,
        recipientPhone: body.phone ? String(body.phone).trim() : post.recipientPhone,
      },
    });
    const note = String(body.note || "").trim();
    await recordVisitDb(token, note ? "ramp_regenerate" : "ramp_capture_pending", {
      mediaUrl,
      ...(note ? { note } : {}),
    });
    void runGenerationJob(req, token, mediaUrl, note ? { extraNote: note } : undefined);
    return { ok: true, token, status: "pending" };
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

  rampMemoryStore.updatePost(token, {
    status: "pending",
    compositeUrl: null,
    careCardUrl: mediaUrl,
    recipientPhone: body.phone ? String(body.phone).trim() : post.recipientPhone,
  });
  const note = String(body.note || "").trim();
  rampMemoryStore.recordVisit(token, note ? "ramp_regenerate" : "ramp_capture_pending", {
    mediaUrl,
    ...(note ? { note } : {}),
  });
  void runGenerationJob(req, token, mediaUrl, note ? { extraNote: note } : undefined);
  return { ok: true, token, status: "pending" };
}

async function getPostStatusImpl(req: Request, token: string): Promise<RampDemoPostDto | null> {
  const t = String(token || "").trim();
  if (!t) return null;

  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.rampDemoPost.findUnique({ where: { token: t } });
      if (row) {
        return dtoFromRow({
          ...row,
          landingUrl: rampLandingUrl(req, row.token),
        });
      }
      // Not in DB — fall through to the memory store (created during outage).
    } catch {
      /* DB unreachable — fall through to memory store */
    }
  }

  return dtoFromMemory(rampMemoryStore.getPost(t));
}

async function regenerateImpl(
  req: Request,
  token: string,
  opts?: { note?: string; visualDirection?: string; imageEdit?: string },
): Promise<{ ok: true; token: string; status: RampPostStatus }> {
  const t = String(token || "").trim();
  if (!t) throw new Error("token is required");

  const post = await getPostStatusImpl(req, t);
  if (!post) throw new Error("Unknown RAMP token");

  const rawMediaUrl = String(post.careCardUrl || "").trim();
  if (!rawMediaUrl) {
    throw new Error("No source capture to regenerate from — re-run capture from Screen 2.");
  }

  const note = String(opts?.note || "").trim();
  await updatePostStatus(t, { status: "pending", compositeUrl: null });
  await recordVisitDb(t, "ramp_regenerate", {
    note,
    visualDirection: opts?.visualDirection || "",
    imageEdit: opts?.imageEdit || "",
  });

  void runGenerationJob(req, t, rawMediaUrl, {
    visualDirection: opts?.visualDirection,
    imageEdit: opts?.imageEdit,
    extraNote: note || undefined,
  });

  return { ok: true, token: t, status: "pending" };
}

function resolveCareCardImageUrl(req: Request): string {
  const env = process.env.RAMP_CARE_CARD_URL?.trim();
  if (env) return env;
  if (RAMP_DEMO_PROFILE.careCardHeroUrl) return RAMP_DEMO_PROFILE.careCardHeroUrl;
  return `${rampPublicBaseUrl(req).replace(/\/$/, "")}/salonx.png`;
}

async function fireClientCareCardImpl(
  req: Request,
  body: FireClientCareCardRequest,
): Promise<FireClientCareCardResponse> {
  const recipientPhone = normalizePhone(String(body.recipientPhone || "").trim());
  if (!recipientPhone) throw new Error("Client phone number is required");

  const token = mintRampToken();
  const brandSlug =
    String(body.brandSlug || RAMP_DEMO_PROFILE.brandSlug).trim() || RAMP_DEMO_PROFILE.brandSlug;
  const recipientName = String(body.recipientName || "Guest").trim() || "Guest";
  const stylistName =
    String(body.stylistName || RAMP_DEMO_PROFILE.stylistName).trim() ||
    RAMP_DEMO_PROFILE.stylistName;
  const products = normalizeProducts(body.products);
  const careCardUrl = resolveCareCardImageUrl(req);
  let landingUrl = rampLandingUrl(req, token);
  let caption = buildClientCareSmsBody({ recipientName, stylistName, landingUrl });
  let mmsMediaUrl = careCardUrl;

  const linkedRampToken = String(body.rampToken || "").trim();
  if (linkedRampToken) {
    const rampPost = await getPostStatusImpl(req, linkedRampToken);
    if (
      rampPost &&
      normalizeStatus(rampPost.status) === "ready" &&
      rampPost.compositeUrl
    ) {
      landingUrl = rampLandingUrl(req, linkedRampToken);
      caption = buildRampShareSmsBody({
        caption: rampPost.caption || "",
      });
      mmsMediaUrl = rampPost.compositeUrl;
    }
  }

  const visitMeta = {
    appointmentId: body.appointmentId ?? null,
    source: "cash_checkout",
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
          status: "ready",
          sourceType: "client_care",
          careCardUrl,
          compositeUrl: careCardUrl,
          caption,
        },
      });
      await recordVisitDb(token, "client_care_created", visitMeta);
    } catch {
      rampMemoryStore.createPost({
        token,
        brandSlug,
        recipientPhone,
        recipientName,
        stylistName,
        products,
        status: "ready",
        sourceType: "client_care",
        careCardUrl,
        compositeUrl: careCardUrl,
        caption,
        landingUrl,
      });
      rampMemoryStore.recordVisit(token, "client_care_created", visitMeta);
    }
  } else {
    rampMemoryStore.createPost({
      token,
      brandSlug,
      recipientPhone,
      recipientName,
      stylistName,
      products,
      status: "ready",
      sourceType: "client_care",
      careCardUrl,
      compositeUrl: careCardUrl,
      caption,
      landingUrl,
    });
    rampMemoryStore.recordVisit(token, "client_care_created", visitMeta);
  }

  const demoOnly = body.demoOnly === true;
  if (demoOnly) {
    await recordVisitDb(token, "client_care_ready", {
      ...visitMeta,
      transport: "demo_manual",
    });
    return {
      ok: true,
      token,
      status: "card_ready",
      landingUrl,
      sms: {
        sent: false,
        mock: true,
        provider: "demo_manual",
      },
    };
  }

  const sms = await sendRampSms({
    to: recipientPhone,
    body: caption,
    mediaUrl: mmsMediaUrl,
  });

  await updatePostStatus(token, { status: "care_sent" });
  await recordVisitDb(token, "client_care_sent", { provider: sms.provider, mock: sms.mock });

  return {
    ok: true,
    token,
    status: "care_sent",
    landingUrl,
    sms: {
      sent: sms.sent,
      mock: sms.mock,
      provider: sms.provider,
      sid: sms.sid,
    },
  };
}

async function sendRampPostSmsImpl(req: Request, token: string): Promise<SendRampSmsResponse> {
  const t = String(token || "").trim();
  if (!t) throw new Error("token is required");

  const post = await getPostStatusImpl(req, t);
  if (!post) throw new Error("Unknown RAMP token");
  if (normalizeStatus(post.status) !== "ready" || !post.compositeUrl) {
    throw new Error("RAMP post is not ready to send");
  }
  if (!post.recipientPhone?.trim()) {
    throw new Error("Client phone number is required to send SMS");
  }

  const body = buildRampShareSmsBody({
    caption: post.caption || "",
  });

  const sms = await sendRampSms({
    to: post.recipientPhone,
    body,
    mediaUrl: post.compositeUrl,
  });

  await updatePostStatus(t, { status: "sent" });
  await recordVisitDb(t, "ramp_sms_sent", { provider: sms.provider, mock: sms.mock });

  return {
    ok: true,
    token: t,
    status: "sent",
    sms: {
      sent: sms.sent,
      mock: sms.mock,
      provider: sms.provider,
      sid: sms.sid,
    },
  };
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

  submitRampCapture: submitRampCaptureImpl,

  getPostStatus: getPostStatusImpl,

  regenerate: regenerateImpl,

  sendRampPostSms: sendRampPostSmsImpl,

  fireClientCareCard: fireClientCareCardImpl,

  startStylistPost: startStylistPostImpl,

  trackCopy: async (token: string, eventType = "caption_copy") => {
    const t = String(token || "").trim();
    if (!t) throw new Error("token is required");
    await recordVisitDb(t, eventType);
    return { ok: true as const, token: t, eventType };
  },

  listRecent: async (limit = 24) => {
    const cap = Math.max(1, Math.min(50, Number(limit) || 24));
    const queueStatuses = ["pending", "generating", "processing", "ready", "failed"];
    const prisma = getPrisma();
    if (prisma) {
      try {
        const rows = await prisma.rampDemoPost.findMany({
          where: { status: { in: queueStatuses } },
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
    const rows = rampMemoryStore
      .listRecent(cap)
      .filter((row) => isRampQueueItem(row.status));
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
