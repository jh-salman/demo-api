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
import { normalizePhone, phonesMatch } from "./ramp-phone.js";
import type {
  FireClientCareCardRequest,
  FireClientCareCardResponse,
  InboundMmsRequest,
  InboundMmsResponse,
  ParkPickResponse,
  RampCandidatesResponse,
  RampDemoPostDto,
  RampLibraryResponse,
  RampPostStatus,
  SendRampSmsResponse,
  StartStylistPostRequest,
  StartStylistPostResponse,
  StoreSharedSelfieRequest,
  SubmitRampCaptureResponse,
} from "./ramp.types.js";

const RAMP_POST_STATUSES = new Set(["ready", "posted", "care_sent", "sent"]);
const RAMP_QUEUE_STATUSES = new Set([
  "pending",
  "pending_pick",
  "generating",
  "processing",
  "ready",
  "failed",
]);
const activeGenerations = new Set<string>();
/** Posts still awaiting a selfie — eligible to receive an inbound MMS. */
const INBOUND_MATCH_STATUSES = [
  "care_sent",
  "landing",
  "selfie_received",
  "pending",
  "pending_pick",
  "generating",
];
/** Posts with a built artifact — surfaced in the cloud library. */
const RAMP_LIBRARY_STATUSES = ["ready", "posted", "sent"];

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
  try {
    await prisma.rampVisit.create({
      data: {
        token,
        eventType,
        metadataJson: metadata ?? undefined,
      },
    });
  } catch {
    rampMemoryStore.recordVisit(token, eventType, metadata);
  }
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
  const referencePosterUrl = String(body.referencePosterUrl || "").trim();
  const backgroundPosterUrl = String(body.backgroundPosterUrl || "").trim();
  const stylistStyleReferenceUrl = String(body.stylistStyleReferenceUrl || "").trim();
  const clientStyleReferenceUrl = String(body.clientStyleReferenceUrl || "").trim();
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
    referencePosterUrl: referencePosterUrl || undefined,
    backgroundPosterUrl: backgroundPosterUrl || undefined,
    stylistStyleReferenceUrl: stylistStyleReferenceUrl || undefined,
    clientStyleReferenceUrl: clientStyleReferenceUrl || undefined,
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
    recipientName?: string;
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

type RampPostGenerationMeta = {
  recipientName: string;
  stylistName: string;
  products: unknown;
  sourceType: string;
  brandSlug: string;
  caption: string | null;
};

async function readPostForGeneration(token: string): Promise<RampPostGenerationMeta | null> {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.rampDemoPost.findUnique({ where: { token } });
      if (row) return row;
    } catch {
      /* DB unreachable — fall through */
    }
  }
  const mem = rampMemoryStore.getPost(token);
  return mem || null;
}

function buildCaptionForPost(postRow: RampPostGenerationMeta): string {
  const postStyle = normalizeRampPostStylePreset(
    String(postRow.sourceType || "ramp_photo").replace(/^ramp_/, "") || "curiosity",
  );
  return (
    postRow.caption ||
    buildDemoCaption({
      recipientName: postRow.recipientName,
      stylistName: postRow.stylistName,
      products: normalizeProducts(postRow.products),
      postStyle,
    })
  );
}

/** Never leave a post in `failed` — always publish source or generated art as ready. */
async function completeGenerationReady(
  token: string,
  rawMediaUrl: string,
  postRow: RampPostGenerationMeta | null,
  compositeUrl: string,
  visitMeta: Record<string, unknown>,
) {
  const caption = postRow ? buildCaptionForPost(postRow) : null;
  await updatePostStatus(token, {
    status: "ready",
    compositeUrl,
    caption,
    careCardUrl: rawMediaUrl,
  });
  await recordVisitDb(token, "ramp_generate_ready", visitMeta);
}

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
    let postRow: RampPostGenerationMeta | null = null;

    if (prisma) {
      try {
        postRow = await prisma.rampDemoPost.findUnique({ where: { token } });
      } catch {
        postRow = null;
      }
    }
    if (!postRow) {
      postRow = rampMemoryStore.getPost(token);
    }

    const postStyle = normalizeRampPostStylePreset(
      String(postRow?.sourceType || "ramp_photo").replace(/^ramp_/, "") || "curiosity",
    );
    const promptMeta = (await readBoltStartPromptMeta(token)) || {};
    const { imageUrl, mock, usedFallback } = await generateBrandedRampImage({
      sourceImageUrl: rawMediaUrl,
      postStyle,
      recipientName: postRow?.recipientName || "",
      stylistName: postRow?.stylistName || RAMP_DEMO_PROFILE.stylistName,
      brandSlug: postRow?.brandSlug || RAMP_DEMO_PROFILE.brandSlug,
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
      referencePosterUrl:
        typeof promptMeta.referencePosterUrl === "string"
          ? promptMeta.referencePosterUrl
          : undefined,
      backgroundPosterUrl:
        typeof promptMeta.backgroundPosterUrl === "string"
          ? promptMeta.backgroundPosterUrl
          : undefined,
      stylistStyleReferenceUrl:
        typeof promptMeta.stylistStyleReferenceUrl === "string"
          ? promptMeta.stylistStyleReferenceUrl
          : undefined,
      clientStyleReferenceUrl:
        typeof promptMeta.clientStyleReferenceUrl === "string"
          ? promptMeta.clientStyleReferenceUrl
          : undefined,
    });

    await completeGenerationReady(token, rawMediaUrl, postRow, imageUrl, {
      imageUrl,
      mock,
      usedFallback: Boolean(usedFallback),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "generation error";
    console.warn("[ramp:generate] fail-safe ready with source photo", token, message);
    try {
      const postRow = await readPostForGeneration(token);
      await completeGenerationReady(token, rawMediaUrl, postRow, rawMediaUrl, {
        imageUrl: rawMediaUrl,
        mock: true,
        usedFallback: true,
        error: message,
      });
    } catch (fallbackErr) {
      const fbMsg = fallbackErr instanceof Error ? fallbackErr.message : "fallback error";
      console.error("[ramp:generate] fail-safe memory write", token, fbMsg);
      rampMemoryStore.updatePost(token, {
        status: "ready",
        compositeUrl: rawMediaUrl,
        careCardUrl: rawMediaUrl,
      });
      rampMemoryStore.recordVisit(token, "ramp_generate_ready", {
        imageUrl: rawMediaUrl,
        mock: true,
        usedFallback: true,
        error: message,
      });
    }
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
        status: "generating",
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
    return { ok: true, token, status: "generating" };
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
    status: "generating",
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
  return { ok: true, token, status: "generating" };
}

/** Find the open post a given sender phone most likely belongs to. */
async function resolveTokenByPhone(phone: string): Promise<string | null> {
  if (!phone) return null;
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.rampDemoPost.findMany({
        where: { status: { in: INBOUND_MATCH_STATUSES } },
        orderBy: { updatedAt: "desc" },
        take: 50,
      });
      const hit = rows.find((r) => phonesMatch(r.recipientPhone || "", phone));
      return hit?.token || null;
    } catch {
      /* table missing — fall through to memory store */
    }
  }
  const mem = rampMemoryStore
    .listRecent(50)
    .find(
      (r) =>
        INBOUND_MATCH_STATUSES.includes(normalizeStatus(r.status)) &&
        phonesMatch(r.recipientPhone || "", phone),
    );
  return mem?.token || null;
}

/**
 * Provider-agnostic inbound selfie loop. The magic link sets `token`; a bare
 * MMS reply sets `phone`/`from` and we resolve the open post. Either way the
 * selfie feeds the same generation pipeline as an in-app capture.
 */
async function ingestInboundMmsImpl(
  req: Request,
  body: InboundMmsRequest,
): Promise<InboundMmsResponse> {
  const mediaUrl = String(
    body.mediaUrl || (Array.isArray(body.mediaUrls) ? body.mediaUrls[0] : "") || "",
  ).trim();
  if (!mediaUrl) throw new Error("mediaUrl is required");

  const phone = String(body.phone || body.from || "").trim();
  let token = String(body.token || "").trim();
  let matchedBy: "token" | "phone" = "token";

  if (!token) {
    if (!phone) throw new Error("token or phone is required");
    const resolved = await resolveTokenByPhone(phone);
    if (!resolved) throw new Error("Unknown RAMP token for inbound phone");
    token = resolved;
    matchedBy = "phone";
  }

  await submitRampCaptureImpl(req, {
    token,
    mediaUrl,
    phone: phone || undefined,
    source: String(body.source || "mms_in").trim() || "mms_in",
  });

  return { ok: true, token, status: "generating", matchedBy };
}

const PENDING_PICK_SOURCE = "pending_pick";

/**
 * Park several candidate shots from the S4 multi-shot review without committing
 * a hero. The post becomes `pending_pick` (a "Pick a photo" queue card) and the
 * shots are retrievable later via {@link listCandidatesImpl}.
 */
async function parkPickImpl(
  token: string,
  mediaUrls: string[],
  phone?: string,
): Promise<ParkPickResponse> {
  const t = String(token || "").trim();
  if (!t) throw new Error("token is required");
  const urls = (Array.isArray(mediaUrls) ? mediaUrls : [])
    .map((u) => String(u || "").trim())
    .filter(Boolean)
    .slice(0, 8);
  if (!urls.length) throw new Error("mediaUrls is required");
  const normPhone = phone ? String(phone).trim() : "";

  const prisma = getPrisma();
  if (prisma) {
    const post = await prisma.rampDemoPost.findUnique({ where: { token: t } });
    if (!post) throw new Error("Unknown RAMP token");
    await prisma.rampSharedAsset.createMany({
      data: urls.map((mediaUrl) => ({
        token: t,
        brandSlug: post.brandSlug,
        source: PENDING_PICK_SOURCE,
        phone: normPhone || null,
        mediaUrl,
        cloudinaryUrl: mediaUrl.includes("cloudinary.com") ? mediaUrl : null,
      })),
    });
    await prisma.rampDemoPost.update({
      where: { token: t },
      data: {
        status: "pending_pick",
        ...(normPhone ? { recipientPhone: normPhone } : {}),
      },
    });
    await recordVisitDb(t, "ramp_pending_pick", { count: urls.length });
    return { ok: true, token: t, status: "pending_pick", count: urls.length };
  }

  const post = rampMemoryStore.getPost(t);
  if (!post) throw new Error("Unknown RAMP token");
  urls.forEach((mediaUrl) => {
    rampMemoryStore.storeAsset({
      token: t,
      brandSlug: post.brandSlug,
      source: PENDING_PICK_SOURCE,
      phone: normPhone || null,
      mediaUrl,
      cloudinaryUrl: mediaUrl.includes("cloudinary.com") ? mediaUrl : null,
    });
  });
  rampMemoryStore.updatePost(t, {
    status: "pending_pick",
    ...(normPhone ? { recipientPhone: normPhone } : {}),
  });
  rampMemoryStore.recordVisit(t, "ramp_pending_pick", { count: urls.length });
  return { ok: true, token: t, status: "pending_pick", count: urls.length };
}

/** The parked candidate shots for a `pending_pick` post. */
async function listCandidatesImpl(token: string): Promise<RampCandidatesResponse> {
  const t = String(token || "").trim();
  if (!t) throw new Error("token is required");

  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.rampSharedAsset.findMany({
        where: { token: t, source: PENDING_PICK_SOURCE },
        orderBy: { createdAt: "desc" },
      });
      return {
        ok: true,
        token: t,
        candidates: rows
          .filter((r) => r.mediaUrl)
          .map((r) => ({ mediaUrl: r.mediaUrl as string, createdAt: r.createdAt.toISOString() })),
      };
    } catch {
      /* table missing — fall through to memory store */
    }
  }
  const rows = rampMemoryStore.listAssets(t, PENDING_PICK_SOURCE);
  return {
    ok: true,
    token: t,
    candidates: rows
      .filter((r) => r.mediaUrl)
      .map((r) => ({ mediaUrl: r.mediaUrl as string, createdAt: r.createdAt })),
  };
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

async function updateRecipientImpl(
  req: Request,
  token: string,
  body: { recipientPhone?: string; recipientName?: string },
): Promise<{ ok: true; post: RampDemoPostDto }> {
  const t = String(token || "").trim();
  if (!t) throw new Error("token is required");

  const recipientPhone = normalizePhone(String(body.recipientPhone || "").trim());
  if (!recipientPhone) throw new Error("Client phone number is required");

  const recipientName = String(body.recipientName || "").trim();
  const patch = {
    recipientPhone,
    ...(recipientName ? { recipientName } : {}),
  };

  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.rampDemoPost.findUnique({ where: { token: t } });
      if (!row) throw new Error("Unknown RAMP token");
      const updated = await prisma.rampDemoPost.update({
        where: { token: t },
        data: patch,
      });
      await recordVisitDb(t, "ramp_recipient_set", patch);
      return {
        ok: true,
        post: dtoFromRow({
          ...updated,
          landingUrl: rampLandingUrl(req, updated.token),
        }),
      };
    } catch (e) {
      if (e instanceof Error && e.message.includes("Unknown RAMP")) throw e;
      /* fall through to memory store */
    }
  }

  const mem = rampMemoryStore.getPost(t);
  if (!mem) throw new Error("Unknown RAMP token");
  rampMemoryStore.updatePost(t, patch);
  rampMemoryStore.recordVisit(t, "ramp_recipient_set", patch);
  const post = dtoFromMemory(rampMemoryStore.getPost(t));
  if (!post) throw new Error("Unknown RAMP token");
  return { ok: true, post };
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
  await updatePostStatus(t, { status: "generating", compositeUrl: null });
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

  return { ok: true, token: t, status: "generating" };
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

  ingestInboundMms: ingestInboundMmsImpl,

  parkPick: parkPickImpl,

  listCandidates: listCandidatesImpl,

  getPostStatus: getPostStatusImpl,

  regenerate: regenerateImpl,

  updateRecipient: updateRecipientImpl,

  sendRampPostSms: sendRampPostSmsImpl,

  fireClientCareCard: fireClientCareCardImpl,

  startStylistPost: startStylistPostImpl,

  trackCopy: async (token: string, eventType = "caption_copy") => {
    const t = String(token || "").trim();
    if (!t) throw new Error("token is required");
    await recordVisitDb(t, eventType);
    return { ok: true as const, token: t, eventType };
  },

  /** Remove a row from Screen1 RAMP queue (cross-device — status leaves queue list). */
  dismissFromQueue: async (token: string) => {
    const t = String(token || "").trim();
    if (!t) throw new Error("token is required");
    const updated = await updatePostStatus(t, { status: "sent" });
    if (!updated) throw new Error("Unknown RAMP token");
    return { ok: true as const, token: t, status: "sent" as const };
  },

  listRecent: async (limit = 24) => {
    const cap = Math.max(1, Math.min(50, Number(limit) || 24));
    const queueStatuses = [
      "pending",
      "pending_pick",
      "generating",
      "processing",
      "ready",
      "failed",
    ];
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
            title:
              row.recipientName ||
              row.recipientPhone ||
              row.stylistName ||
              "RAMP post",
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
        title:
          row.recipientName ||
          row.recipientPhone ||
          row.stylistName ||
          "RAMP post",
        status: normalizeStatus(row.status),
        createdAt: row.createdAt,
      })),
    };
  },

  /** Cloud library — built artifacts (ready/posted/sent), any device. */
  listLibrary: async (req: Request, limit = 40): Promise<RampLibraryResponse> => {
    const cap = Math.max(1, Math.min(100, Number(limit) || 40));
    const prisma = getPrisma();
    if (prisma) {
      try {
        const rows = await prisma.rampDemoPost.findMany({
          where: { compositeUrl: { not: null }, status: { in: RAMP_LIBRARY_STATUSES } },
          orderBy: { updatedAt: "desc" },
          take: cap,
        });
        return {
          ok: true as const,
          items: rows.map((row) => ({
            token: row.token,
            title: row.recipientName || row.recipientPhone || row.stylistName || "RAMP post",
            caption: row.caption,
            compositeUrl: row.compositeUrl,
            status: normalizeStatus(row.status),
            landingUrl: rampLandingUrl(req, row.token),
            createdAt: row.createdAt.toISOString(),
          })),
        };
      } catch {
        /* table missing — fall through to memory store */
      }
    }
    const rows = rampMemoryStore
      .listRecent(100)
      .filter(
        (row) => row.compositeUrl && RAMP_LIBRARY_STATUSES.includes(normalizeStatus(row.status)),
      )
      .slice(0, cap);
    return {
      ok: true as const,
      items: rows.map((row) => ({
        token: row.token,
        title: row.recipientName || row.recipientPhone || row.stylistName || "RAMP post",
        caption: row.caption,
        compositeUrl: row.compositeUrl,
        status: normalizeStatus(row.status),
        landingUrl: row.landingUrl,
        createdAt: row.createdAt,
      })),
    };
  },
};
