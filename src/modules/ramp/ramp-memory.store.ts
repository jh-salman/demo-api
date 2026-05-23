import { randomBytes } from "node:crypto";
import type { RampDemoPostDto, RampPostStatus } from "./ramp.types.js";

type MemoryPost = RampDemoPostDto & { id: string };

const postsByToken = new Map<string, MemoryPost>();
const visits: Array<{ id: string; token: string; eventType: string; metadataJson: unknown; createdAt: string }> = [];
const assets: Array<{
  id: string;
  token: string;
  brandSlug: string;
  source: string;
  phone: string | null;
  mediaUrl: string | null;
  cloudinaryUrl: string | null;
  createdAt: string;
}> = [];

function memId(): string {
  return `mem_${randomBytes(8).toString("hex")}`;
}

export function mintRampToken(): string {
  return randomBytes(12).toString("hex");
}

export const rampMemoryStore = {
  createPost(input: Omit<RampDemoPostDto, "createdAt" | "updatedAt"> & { id?: string }) {
    const now = new Date().toISOString();
    const row: MemoryPost = {
      ...input,
      id: input.id || memId(),
      createdAt: now,
      updatedAt: now,
    };
    postsByToken.set(row.token, row);
    return row;
  },

  getPost(token: string): MemoryPost | null {
    return postsByToken.get(token) || null;
  },

  updatePost(token: string, patch: Partial<MemoryPost>): MemoryPost | null {
    const cur = postsByToken.get(token);
    if (!cur) return null;
    const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
    postsByToken.set(token, next);
    return next;
  },

  recordVisit(token: string, eventType: string, metadataJson?: unknown) {
    visits.push({
      id: memId(),
      token,
      eventType,
      metadataJson: metadataJson ?? null,
      createdAt: new Date().toISOString(),
    });
  },

  storeAsset(input: {
    token: string;
    brandSlug: string;
    source: string;
    phone?: string | null;
    mediaUrl?: string | null;
    cloudinaryUrl?: string | null;
  }) {
    const row = {
      id: memId(),
      token: input.token,
      brandSlug: input.brandSlug,
      source: input.source,
      phone: input.phone ?? null,
      mediaUrl: input.mediaUrl ?? null,
      cloudinaryUrl: input.cloudinaryUrl ?? null,
      createdAt: new Date().toISOString(),
    };
    assets.push(row);
    return row;
  },
};

export function normalizeProducts(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => (typeof p === "string" ? p.trim() : String(p || "").trim()))
    .filter(Boolean)
    .slice(0, 12);
}

export function normalizeStatus(raw: string | null | undefined): RampPostStatus {
  const allowed: RampPostStatus[] = [
    "care_sent",
    "landing",
    "selfie_received",
    "processing",
    "ready",
    "posted",
  ];
  return allowed.includes(raw as RampPostStatus) ? (raw as RampPostStatus) : "care_sent";
}
