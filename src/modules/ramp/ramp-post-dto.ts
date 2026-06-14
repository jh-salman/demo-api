import type { RampDemoPostDto, RampTagDto } from "./ramp.types.js";
import {
  isArmedPostType,
  normalizeLinksInput,
  normalizePostTypeLabel,
  normalizeTagsInput,
  tagsToStringList,
} from "./ramp-post-fields.js";
import { normalizeProducts } from "./ramp-memory.store.js";

type RampPostRowLike = {
  token: string;
  brandSlug: string;
  recipientPhone: string;
  recipientName: string;
  stylistName: string;
  products: unknown;
  status: string;
  sourceType: string;
  careCardUrl?: string | null;
  compositeUrl?: string | null;
  caption?: string | null;
  aiCaptionDraft?: string | null;
  backgroundPosterUrl?: string | null;
  stylistStyleReferenceUrl?: string | null;
  clientStyleReferenceUrl?: string | null;
  capturePath?: string | null;
  postStyle?: string | null;
  postType?: string | null;
  tags?: unknown;
  links?: unknown;
  visualDirection?: string | null;
  imageEdit?: string | null;
  brandLayer?: string | null;
  compositeMode?: string | null;
  armed?: boolean | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  landingUrl: string;
};

function iso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

export function tagsFromStored(raw: unknown): RampTagDto[] {
  const normalized = normalizeTagsInput(raw);
  if (normalized.length) return normalized;
  if (Array.isArray(raw)) {
    return raw
      .map((t) => String(t || "").trim())
      .filter(Boolean)
      .map((label) => ({ label, on: true }));
  }
  return [];
}

export function dtoFromRampRow(
  row: RampPostRowLike,
  statusNormalizer: (s: string | null | undefined) => RampDemoPostDto["status"],
): RampDemoPostDto {
  const postType = normalizePostTypeLabel(row.postType || "Curiosity");
  const caption = row.caption ?? null;
  const tags = tagsFromStored(row.tags);
  return {
    token: row.token,
    brandSlug: row.brandSlug,
    recipientPhone: row.recipientPhone,
    recipientName: row.recipientName,
    stylistName: row.stylistName,
    products: normalizeProducts(row.products),
    status: statusNormalizer(row.status),
    sourceType: row.sourceType,
    careCardUrl: row.careCardUrl ?? null,
    compositeUrl: row.compositeUrl ?? null,
    caption,
    aiCaptionDraft: row.aiCaptionDraft ?? caption,
    backgroundPosterUrl: row.backgroundPosterUrl ?? null,
    stylistStyleReferenceUrl: row.stylistStyleReferenceUrl ?? null,
    clientStyleReferenceUrl: row.clientStyleReferenceUrl ?? null,
    capturePath: String(row.capturePath || "stylist_path").trim() || "stylist_path",
    postStyle: String(row.postStyle || "curiosity").trim() || "curiosity",
    postType,
    tags,
    links: normalizeLinksInput(row.links),
    visualDirection: String(row.visualDirection || "raw").trim() || "raw",
    imageEdit: String(row.imageEdit || "hair_color_pop").trim() || "hair_color_pop",
    brandLayer: String(row.brandLayer || "active_brand").trim() || "active_brand",
    compositeMode: String(row.compositeMode || "deterministic").trim() || "deterministic",
    armed: row.armed != null ? Boolean(row.armed) : isArmedPostType(postType),
    landingUrl: row.landingUrl,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function buildDraftPatchData(input: {
  caption?: string;
  aiCaptionDraft?: string;
  tags?: unknown;
  links?: unknown;
  postType?: string;
  postStyle?: string;
  backgroundPosterUrl?: string;
  stylistStyleReferenceUrl?: string;
  clientStyleReferenceUrl?: string;
  capturePath?: string;
  visualDirection?: string;
  imageEdit?: string;
  brandLayer?: string;
  compositeMode?: string;
  armed?: boolean;
}) {
  const patch: Record<string, unknown> = {};
  if (typeof input.caption === "string") patch.caption = input.caption.trim();
  if (typeof input.aiCaptionDraft === "string") {
    patch.aiCaptionDraft = input.aiCaptionDraft.trim();
  }
  if (input.tags !== undefined) {
    const tags = normalizeTagsInput(input.tags);
    patch.tags = tags;
  }
  if (input.links !== undefined) {
    patch.links = normalizeLinksInput(input.links);
  }
  if (typeof input.postType === "string" && input.postType.trim()) {
    const postType = normalizePostTypeLabel(input.postType);
    patch.postType = postType;
    patch.armed = isArmedPostType(postType);
  }
  if (typeof input.postStyle === "string" && input.postStyle.trim()) {
    patch.postStyle = input.postStyle.trim();
  }
  if (typeof input.backgroundPosterUrl === "string") {
    patch.backgroundPosterUrl = input.backgroundPosterUrl.trim() || null;
  }
  if (typeof input.stylistStyleReferenceUrl === "string") {
    patch.stylistStyleReferenceUrl = input.stylistStyleReferenceUrl.trim() || null;
  }
  if (typeof input.clientStyleReferenceUrl === "string") {
    patch.clientStyleReferenceUrl = input.clientStyleReferenceUrl.trim() || null;
  }
  if (typeof input.capturePath === "string" && input.capturePath.trim()) {
    patch.capturePath = input.capturePath.trim();
  }
  if (typeof input.visualDirection === "string" && input.visualDirection.trim()) {
    patch.visualDirection = input.visualDirection.trim();
  }
  if (typeof input.imageEdit === "string" && input.imageEdit.trim()) {
    patch.imageEdit = input.imageEdit.trim();
  }
  if (typeof input.brandLayer === "string" && input.brandLayer.trim()) {
    patch.brandLayer = input.brandLayer.trim();
  }
  if (typeof input.compositeMode === "string" && input.compositeMode.trim()) {
    patch.compositeMode = input.compositeMode.trim();
  }
  if (typeof input.armed === "boolean") patch.armed = input.armed;
  return patch;
}

export function captionTagsForBuild(tags: RampTagDto[]): string[] {
  return tagsToStringList(tags);
}

/** Defaults for in-memory RAMP posts when DB is unavailable. */
export function rampMemoryPostDefaults(): Omit<
  RampDemoPostDto,
  "token" | "brandSlug" | "recipientPhone" | "recipientName" | "stylistName" | "products" | "status" | "sourceType" | "careCardUrl" | "compositeUrl" | "caption" | "landingUrl" | "createdAt" | "updatedAt"
> {
  return {
    aiCaptionDraft: null,
    backgroundPosterUrl: null,
    stylistStyleReferenceUrl: null,
    clientStyleReferenceUrl: null,
    capturePath: "stylist_path",
    postStyle: "curiosity",
    postType: "Curiosity",
    tags: [],
    links: [],
    visualDirection: "raw",
    imageEdit: "hair_color_pop",
    brandLayer: "active_brand",
    compositeMode: "deterministic",
    armed: false,
  };
}
