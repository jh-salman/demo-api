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
import { generateBrandedRampImage, isOpenAiMockMode, uploadGeneratedBuffer } from "./ramp-openai.js";
import { normalizeRampPostStylePreset } from "./ramp-ai-prompts.js";
import { normalizePhone, phonesMatch } from "./ramp-phone.js";
import { compositeRampPoster } from "./ramp-composite.js";
import {
  resolveRampBrandDefaults,
  saveRampBackgroundToBrand,
} from "./ramp-brand-config.js";
import {
  captionTagsForBuild,
  dtoFromRampRow,
  buildDraftPatchData,
  tagsFromStored,
  rampMemoryPostDefaults,
} from "./ramp-post-dto.js";
import {
  isArmedPostType,
  normalizePostTypeLabel,
  normalizeLinksInput,
  postTypeToPostStyle,
} from "./ramp-post-fields.js";
import type {
  CompositeRampResponse,
  FireClientCareCardRequest,
  FireClientCareCardResponse,
  InboundMmsRequest,
  InboundMmsResponse,
  ParkPickResponse,
  PatchRampDraftRequest,
  RampCandidatesResponse,
  RampDemoPostDto,
  RampLibraryResponse,
  RampPostStatus,
  RegenerateRampRequest,
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

function toPostDto(
  req: Request,
  row: Parameters<typeof dtoFromRampRow>[0],
): RampDemoPostDto {
  return dtoFromRampRow(
    { ...row, landingUrl: row.landingUrl || rampLandingUrl(req, row.token) },
    normalizeStatus,
  );
}

async function mergePostWithVisitMeta(
  token: string,
  row: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const meta = (await readBoltStartPromptMeta(token)) || {};
  return {
    ...row,
    backgroundPosterUrl:
      row.backgroundPosterUrl ??
      (typeof meta.backgroundPosterUrl === "string" ? meta.backgroundPosterUrl : null),
    stylistStyleReferenceUrl:
      row.stylistStyleReferenceUrl ??
      (typeof meta.stylistStyleReferenceUrl === "string"
        ? meta.stylistStyleReferenceUrl
        : null),
    clientStyleReferenceUrl:
      row.clientStyleReferenceUrl ??
      (typeof meta.clientStyleReferenceUrl === "string"
        ? meta.clientStyleReferenceUrl
        : null),
    capturePath:
      row.capturePath ??
      (typeof meta.capturePath === "string" ? meta.capturePath : "stylist_path"),
    postStyle:
      row.postStyle ?? (typeof meta.postStyle === "string" ? meta.postStyle : "curiosity"),
    visualDirection:
      row.visualDirection ??
      (typeof meta.visualDirection === "string" ? meta.visualDirection : "raw"),
    imageEdit:
      row.imageEdit ?? (typeof meta.imageEdit === "string" ? meta.imageEdit : "hair_color_pop"),
    brandLayer:
      row.brandLayer ?? (typeof meta.brandLayer === "string" ? meta.brandLayer : "active_brand"),
    tags: row.tags ?? (Array.isArray(meta.tags) ? meta.tags : []),
    links: row.links ?? (Array.isArray(meta.links) ? meta.links : []),
  };
}

async function resolveBackgroundPosterUrl(
  token: string,
  row: {
    brandSlug?: string;
    backgroundPosterUrl?: string | null;
  } | null,
  override?: string,
): Promise<string> {
  const direct = String(override || row?.backgroundPosterUrl || "").trim();
  if (direct) return direct;
  const meta = await readBoltStartPromptMeta(token);
  const fromMeta = String(meta?.backgroundPosterUrl || "").trim();
  if (fromMeta) return fromMeta;
  const brandDefaults = await resolveRampBrandDefaults(row?.brandSlug);
  return brandDefaults.defaultBackgroundPosterUrl;
}

type RampGenerationOverrides = {
  visualDirection?: string;
  imageEdit?: string;
  extraNote?: string;
  backgroundPosterUrl?: string;
  postStyle?: string;
  postType?: string;
  mode?: "deterministic" | "ai";
  selfieUrl?: string;
};

async function runDeterministicComposite(
  req: Request,
  _token: string,
  selfieUrl: string,
  backgroundUrl: string,
): Promise<string> {
  const buffer = await compositeRampPoster({
    backgroundUrl,
    selfieUrl,
  });
  return uploadGeneratedBuffer(buffer, requestOrigin(req));
}

async function generateRampArtifact(
  req: Request,
  token: string,
  rawMediaUrl: string,
  postRow: RampPostGenerationMeta | null,
  overrides?: RampGenerationOverrides,
): Promise<{ imageUrl: string; mock: boolean; usedFallback?: boolean; mode: string }> {
  const promptMeta = (await readBoltStartPromptMeta(token)) || {};
  const backgroundUrl = await resolveBackgroundPosterUrl(token, postRow, overrides?.backgroundPosterUrl);
  const brandDefaults = await resolveRampBrandDefaults(postRow?.brandSlug);
  const rowMode = String(postRow?.compositeMode || "").trim().toLowerCase();
  const envMode = brandDefaults.compositeMode;
  const reqMode = String(overrides?.mode || "").trim().toLowerCase();
  const mode =
    reqMode === "ai" || reqMode === "deterministic"
      ? reqMode
      : rowMode === "ai" || rowMode === "deterministic"
        ? rowMode
        : envMode;

  if (mode !== "ai" && backgroundUrl) {
    try {
      const imageUrl = await runDeterministicComposite(req, token, rawMediaUrl, backgroundUrl);
      return { imageUrl, mock: false, mode: "deterministic" };
    } catch (e) {
      console.warn("[ramp:composite] deterministic failed — trying AI fallback", e);
      if (mode === "deterministic" && envMode === "deterministic") {
        throw e;
      }
    }
  }

  if (isOpenAiMockMode()) {
    return { imageUrl: rawMediaUrl, mock: true, mode: "mock" };
  }

  const postStyle = normalizeRampPostStylePreset(
    overrides?.postStyle ||
      postRow?.postStyle ||
      postTypeToPostStyle(overrides?.postType || postRow?.postType) ||
      String(postRow?.sourceType || "ramp_photo").replace(/^ramp_/, "") ||
      "curiosity",
  );

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
      postRow?.visualDirection ||
      (typeof promptMeta.visualDirection === "string" ? promptMeta.visualDirection : undefined),
    imageEdit:
      overrides?.imageEdit ||
      postRow?.imageEdit ||
      (typeof promptMeta.imageEdit === "string" ? promptMeta.imageEdit : undefined),
    brandLayer:
      postRow?.brandLayer ||
      (typeof promptMeta.brandLayer === "string" ? promptMeta.brandLayer : undefined),
    captureType: typeof promptMeta.captureType === "string" ? promptMeta.captureType : undefined,
    extraNote: overrides?.extraNote,
    referencePosterUrl:
      typeof promptMeta.referencePosterUrl === "string" ? promptMeta.referencePosterUrl : undefined,
    backgroundPosterUrl: backgroundUrl || undefined,
    stylistStyleReferenceUrl:
      postRow?.stylistStyleReferenceUrl ||
      (typeof promptMeta.stylistStyleReferenceUrl === "string"
        ? promptMeta.stylistStyleReferenceUrl
        : undefined),
    clientStyleReferenceUrl:
      postRow?.clientStyleReferenceUrl ||
      (typeof promptMeta.clientStyleReferenceUrl === "string"
        ? promptMeta.clientStyleReferenceUrl
        : undefined),
  });

  return { imageUrl, mock, usedFallback, mode: "ai" };
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
  const brandDefaults = await resolveRampBrandDefaults(brandSlug);
  const backgroundPosterUrl =
    String(body.backgroundPosterUrl || "").trim() ||
    brandDefaults.defaultBackgroundPosterUrl;
  const stylistStyleReferenceUrl =
    String(body.stylistStyleReferenceUrl || "").trim() ||
    brandDefaults.stylistStyleReferenceUrl;
  const clientStyleReferenceUrl =
    String(body.clientStyleReferenceUrl || "").trim() ||
    brandDefaults.clientStyleReferenceUrl;
  const referencePosterUrl = String(body.referencePosterUrl || "").trim();
  const tags = normalizeTags(body.tags);
  const links = normalizeLinks(body.links);
  const tagDtos = tags.map((label) => ({ label, on: true }));
  const postType = normalizePostTypeLabel(body.postStyle ? undefined : "Curiosity");
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
    postType,
    compositeMode: brandDefaults.compositeMode,
  };

  const postCreateData = {
    token,
    brandSlug,
    recipientPhone,
    recipientName,
    stylistName,
    products,
    status: "landing" as const,
    sourceType,
    caption,
    aiCaptionDraft: caption,
    backgroundPosterUrl: backgroundPosterUrl || null,
    stylistStyleReferenceUrl: stylistStyleReferenceUrl || null,
    clientStyleReferenceUrl: clientStyleReferenceUrl || null,
    capturePath,
    postStyle,
    postType,
    tags: tagDtos,
    links,
    visualDirection,
    imageEdit,
    brandLayer,
    compositeMode: brandDefaults.compositeMode,
    armed: isArmedPostType(postType),
  };

  const prisma = getPrisma();
  if (prisma) {
    try {
      await prisma.rampDemoPost.create({
        data: postCreateData,
      });
      await recordVisitDb(token, "ramp_bolt_start", visitMeta);
      return { ok: true, token, landingUrl, status: "landing" };
    } catch {
      /* table missing — fall through to memory store */
    }
  }

  rampMemoryStore.createPost({
    ...postCreateData,
    careCardUrl: null,
    compositeUrl: null,
    landingUrl,
  });
  rampMemoryStore.recordVisit(token, "ramp_bolt_start", visitMeta);

  return { ok: true, token, landingUrl, status: "landing" };
}

async function updatePostStatus(token: string, patch: Record<string, unknown>) {
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

type RampPostGenerationMeta = {
  recipientName: string;
  stylistName: string;
  products: unknown;
  sourceType: string;
  brandSlug: string;
  caption: string | null;
  postStyle?: string | null;
  postType?: string | null;
  backgroundPosterUrl?: string | null;
  stylistStyleReferenceUrl?: string | null;
  clientStyleReferenceUrl?: string | null;
  visualDirection?: string | null;
  imageEdit?: string | null;
  brandLayer?: string | null;
  compositeMode?: string | null;
  tags?: unknown;
  links?: unknown;
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
    postRow.postStyle ||
      postTypeToPostStyle(postRow.postType) ||
      String(postRow.sourceType || "ramp_photo").replace(/^ramp_/, "") ||
      "curiosity",
  );
  const tagList = captionTagsForBuild(tagsFromStored(postRow.tags));
  const linkList = normalizeLinksInput(postRow.links);
  return (
    postRow.caption ||
    buildDemoCaption({
      recipientName: postRow.recipientName,
      stylistName: postRow.stylistName,
      products: normalizeProducts(postRow.products),
      postStyle,
      tags: tagList,
      links: linkList,
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

    const { imageUrl, mock, usedFallback, mode } = await generateRampArtifact(
      req,
      token,
      rawMediaUrl,
      postRow,
      overrides,
    );

    await completeGenerationReady(token, rawMediaUrl, postRow, imageUrl, {
      imageUrl,
      mock,
      usedFallback: Boolean(usedFallback),
      mode,
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
        const merged = await mergePostWithVisitMeta(t, row as Record<string, unknown>);
        return toPostDto(req, merged as Parameters<typeof dtoFromRampRow>[0]);
      }
    } catch {
      /* DB unreachable — fall through to memory store */
    }
  }

  const mem = rampMemoryStore.getPost(t);
  if (!mem) return null;
  const merged = await mergePostWithVisitMeta(t, mem as unknown as Record<string, unknown>);
  return toPostDto(req, merged as Parameters<typeof dtoFromRampRow>[0]);
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
      await prisma.rampDemoPost.update({
        where: { token: t },
        data: patch,
      });
      await recordVisitDb(t, "ramp_recipient_set", patch);
      const post = await getPostStatusImpl(req, t);
      if (!post) throw new Error("Unknown RAMP token");
      return { ok: true, post };
    } catch (e) {
      if (e instanceof Error && e.message.includes("Unknown RAMP")) throw e;
      /* fall through to memory store */
    }
  }

  const mem = rampMemoryStore.getPost(t);
  if (!mem) throw new Error("Unknown RAMP token");
  rampMemoryStore.updatePost(t, patch);
  rampMemoryStore.recordVisit(t, "ramp_recipient_set", patch);
  const post = await getPostStatusImpl(req, t);
  if (!post) throw new Error("Unknown RAMP token");
  return { ok: true, post };
}

async function patchDraftImpl(
  req: Request,
  token: string,
  body: PatchRampDraftRequest,
): Promise<{ ok: true; post: RampDemoPostDto }> {
  const t = String(token || "").trim();
  if (!t) throw new Error("token is required");

  const patch = buildDraftPatchData({
    caption: body.caption,
    aiCaptionDraft: body.aiCaptionDraft,
    tags: body.tags,
    links: body.links,
    postType: body.postType,
    postStyle: body.postStyle || (body.postType ? postTypeToPostStyle(body.postType) : undefined),
    backgroundPosterUrl: body.backgroundPosterUrl,
    stylistStyleReferenceUrl: body.stylistStyleReferenceUrl,
    clientStyleReferenceUrl: body.clientStyleReferenceUrl,
    capturePath: body.capturePath,
    visualDirection: body.visualDirection,
    imageEdit: body.imageEdit,
    brandLayer: body.brandLayer,
    compositeMode: body.compositeMode,
    armed: body.armed,
  });

  if (!Object.keys(patch).length) throw new Error("No draft fields to update");

  const updated = await updatePostStatus(t, patch);
  if (!updated) throw new Error("Unknown RAMP token");

  await recordVisitDb(t, "ramp_draft_patch", patch);
  const post = await getPostStatusImpl(req, t);
  if (!post) throw new Error("Unknown RAMP token");
  return { ok: true, post };
}

async function compositeImpl(
  req: Request,
  token: string,
  body: { selfieUrl?: string; backgroundPosterUrl?: string; mode?: "deterministic" | "ai" },
): Promise<CompositeRampResponse> {
  const t = String(token || "").trim();
  if (!t) throw new Error("token is required");

  const post = await getPostStatusImpl(req, t);
  if (!post) throw new Error("Unknown RAMP token");

  const selfieUrl = String(body.selfieUrl || post.careCardUrl || "").trim();
  if (!selfieUrl) throw new Error("No source selfie — capture or upload a photo first.");

  const backgroundUrl = await resolveBackgroundPosterUrl(t, post, body.backgroundPosterUrl);
  if (!backgroundUrl && (body.mode || post.compositeMode) !== "ai") {
    throw new Error("No background poster configured — set brand.ramp default or upload a background.");
  }

  await updatePostStatus(t, { status: "generating", compositeUrl: null });

  const postRow = await readPostForGeneration(t);
  const { imageUrl, mode } = await generateRampArtifact(req, t, selfieUrl, postRow, {
    backgroundPosterUrl: backgroundUrl || body.backgroundPosterUrl,
    mode: body.mode || "deterministic",
    selfieUrl,
  });

  await completeGenerationReady(t, selfieUrl, postRow, imageUrl, {
    imageUrl,
    mode,
    deterministic: mode === "deterministic",
  });

  return { ok: true, token: t, status: "ready", compositeUrl: imageUrl, mode };
}

async function listBackgroundsImpl(brandSlug?: string) {
  const defaults = await resolveRampBrandDefaults(brandSlug);
  return { ok: true as const, items: defaults.backgrounds };
}

async function saveBackgroundImpl(
  req: Request,
  body: { brandSlug?: string; url?: string; label?: string; setAsDefault?: boolean },
) {
  const url = String(body.url || "").trim();
  if (!url) throw new Error("url is required");
  const saved = await saveRampBackgroundToBrand({
    brandSlug: typeof body.brandSlug === "string" ? body.brandSlug : undefined,
    url,
    label: typeof body.label === "string" ? body.label : undefined,
    setAsDefault: body.setAsDefault,
  });
  await broadcastRampBrandConfig(req);
  return {
    ok: true as const,
    defaultBackgroundPosterUrl: saved.defaultBackgroundPosterUrl,
    items: saved.items,
  };
}

async function broadcastRampBrandConfig(req: Request) {
  const { readConfigForLiveApp } = await import("../../lib/store.js");
  const { configJsonWithMeta } = await import("../../lib/config-response.js");
  const { emitConfigUpdated } = await import("../../realtime/io.js");
  const live = await readConfigForLiveApp();
  const liveBody = configJsonWithMeta(live.config, req, live.webProjectionRevision);
  emitConfigUpdated({
    scope: "published",
    revision: live.revision,
    webProjectionRevision: live.webProjectionRevision,
    data: liveBody,
  });
}

async function regenerateImpl(
  req: Request,
  token: string,
  opts?: RegenerateRampRequest,
): Promise<{ ok: true; token: string; status: RampPostStatus }> {
  const t = String(token || "").trim();
  if (!t) throw new Error("token is required");

  const post = await getPostStatusImpl(req, t);
  if (!post) throw new Error("Unknown RAMP token");

  const rawMediaUrl = String(opts?.selfieUrl || post.careCardUrl || "").trim();
  if (!rawMediaUrl) {
    throw new Error("No source capture to regenerate from — re-run capture from Screen 2.");
  }

  const note = String(opts?.note || "").trim();
  const draftPatch = buildDraftPatchData({
    postType: opts?.postType,
    postStyle: opts?.postStyle || (opts?.postType ? postTypeToPostStyle(opts.postType) : undefined),
    backgroundPosterUrl: opts?.backgroundPosterUrl,
    visualDirection: opts?.visualDirection,
    imageEdit: opts?.imageEdit,
    compositeMode: opts?.mode,
  });
  if (Object.keys(draftPatch).length) {
    await updatePostStatus(t, draftPatch);
  }

  await updatePostStatus(t, { status: "generating", compositeUrl: null });
  await recordVisitDb(t, "ramp_regenerate", {
    note,
    visualDirection: opts?.visualDirection || "",
    imageEdit: opts?.imageEdit || "",
    backgroundPosterUrl: opts?.backgroundPosterUrl || "",
    postType: opts?.postType || "",
    mode: opts?.mode || "",
  });

  void runGenerationJob(req, t, rawMediaUrl, {
    visualDirection: opts?.visualDirection,
    imageEdit: opts?.imageEdit,
    extraNote: note || undefined,
    backgroundPosterUrl: opts?.backgroundPosterUrl,
    postStyle: opts?.postStyle,
    postType: opts?.postType,
    mode: opts?.mode,
    selfieUrl: opts?.selfieUrl,
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
        ...rampMemoryPostDefaults(),
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
      ...rampMemoryPostDefaults(),
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

    const post = await getPostStatusImpl(req, t);
    if (!post || !isRampPostReady(post.status) || !post.compositeUrl) return null;
    await recordVisitDb(t, "post_it_view");
    return post;
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
          where: {
            status: { in: queueStatuses },
            OR: [
              { careCardUrl: { not: null } },
              { status: { in: ["pending", "pending_pick"] } },
            ],
          },
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
            postType: normalizePostTypeLabel(
              (row as { postType?: string | null }).postType || "Curiosity",
            ),
            armed:
              (row as { armed?: boolean | null }).armed != null
                ? Boolean((row as { armed?: boolean | null }).armed)
                : isArmedPostType((row as { postType?: string | null }).postType),
            compositeUrl: row.compositeUrl,
            createdAt: row.createdAt.toISOString(),
          })),
        };
      } catch {
        /* table missing — fall through to memory store */
      }
    }
    const rows = rampMemoryStore
      .listRecent(cap)
      .filter((row) => isRampQueueItem(row.status))
      .filter(
        (row) =>
          Boolean(row.careCardUrl) ||
          normalizeStatus(row.status) === "pending" ||
          normalizeStatus(row.status) === "pending_pick",
      );
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
        postType: normalizePostTypeLabel(row.postType || "Curiosity"),
        armed: row.armed != null ? Boolean(row.armed) : isArmedPostType(row.postType),
        compositeUrl: row.compositeUrl,
        createdAt: row.createdAt,
      })),
    };
  },

  patchDraft: patchDraftImpl,

  composite: compositeImpl,

  listBackgrounds: listBackgroundsImpl,

  saveBackground: saveBackgroundImpl,

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
