import type { Prisma, RampPost } from "@prisma/client";
import { getPrisma } from "../../lib/prisma.js";
import { shouldSkipPrismaDb } from "../../lib/prisma-resilience.js";

const SALON_ID = "default";

/** Queue = items still in play (not shipped/dismissed). */
export const RAMP_ACTIVE_STATUSES = ["queued", "building", "generated"];

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma || shouldSkipPrismaDb()) {
    throw new Error("DATABASE_URL not configured");
  }
  return prisma;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** Serialize a row for the API (dates → ISO, JSON columns typed). */
export function rampPostToDto(post: RampPost) {
  return {
    id: post.id,
    salonId: post.salonId,
    clientId: post.clientId,
    clientName: post.clientName,
    clientSub: post.clientSub,
    clientEmoji: post.clientEmoji || "🧑",
    stylistId: post.stylistId,
    source: post.source,
    status: post.status,
    capturedImages: asStringArray(post.capturedImages),
    generatedImages: asStringArray(post.generatedImages),
    heroImage: post.heroImage,
    caption: post.caption,
    type: post.type,
    tags: Array.isArray(post.tags) ? post.tags : [],
    links: Array.isArray(post.links) ? post.links : [],
    backgroundId: post.backgroundId,
    genState: post.genState,
    shipMode: post.shipMode,
    shippedAt: post.shippedAt?.toISOString() ?? null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}

export type RampPostInput = {
  clientName: string;
  clientId?: string | null;
  clientSub?: string | null;
  clientEmoji?: string | null;
  stylistId?: string | null;
  source?: string;
  status?: string;
  capturedImages?: string[];
  generatedImages?: string[];
  heroImage?: string | null;
  caption?: string;
  type?: string;
  tags?: unknown[];
  links?: unknown[];
  backgroundId?: string;
  genState?: string;
  shipMode?: string | null;
  shippedAt?: string | null;
  salonId?: string;
};

export const rampService = {
  async list(status?: string, salonId = SALON_ID) {
    const prisma = requirePrisma();
    const where: Prisma.RampPostWhereInput = { salonId };
    if (status === "active" || !status) {
      where.status = { in: RAMP_ACTIVE_STATUSES };
    } else if (status !== "all") {
      where.status = status;
    }
    const rows = await prisma.rampPost.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.map(rampPostToDto);
  },

  async get(id: string) {
    const prisma = requirePrisma();
    const row = await prisma.rampPost.findUnique({ where: { id } });
    return row ? rampPostToDto(row) : null;
  },

  async create(input: RampPostInput) {
    const prisma = requirePrisma();
    const captured = input.capturedImages ?? [];
    const row = await prisma.rampPost.create({
      data: {
        salonId: input.salonId || SALON_ID,
        clientId: input.clientId ?? null,
        clientName: input.clientName,
        clientSub: input.clientSub ?? null,
        clientEmoji: input.clientEmoji ?? "🧑",
        stylistId: input.stylistId ?? null,
        source: input.source || "capture",
        status: input.status || "queued",
        capturedImages: captured as Prisma.InputJsonValue,
        generatedImages: (input.generatedImages ?? []) as Prisma.InputJsonValue,
        heroImage: input.heroImage ?? captured[0] ?? null,
        caption: input.caption ?? "",
        type: input.type ?? "Curiosity",
        tags: (input.tags ?? []) as Prisma.InputJsonValue,
        links: (input.links ?? []) as Prisma.InputJsonValue,
        backgroundId: input.backgroundId ?? "bg1",
      },
    });
    return rampPostToDto(row);
  },

  async update(id: string, patch: Partial<RampPostInput>) {
    const prisma = requirePrisma();
    const data: Prisma.RampPostUpdateInput = {};

    if (patch.clientName !== undefined) data.clientName = patch.clientName;
    if (patch.clientId !== undefined) data.clientId = patch.clientId;
    if (patch.clientSub !== undefined) data.clientSub = patch.clientSub;
    if (patch.clientEmoji !== undefined) data.clientEmoji = patch.clientEmoji;
    if (patch.stylistId !== undefined) data.stylistId = patch.stylistId;
    if (patch.source !== undefined) data.source = patch.source;
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.capturedImages !== undefined) {
      data.capturedImages = patch.capturedImages as Prisma.InputJsonValue;
    }
    if (patch.generatedImages !== undefined) {
      data.generatedImages = patch.generatedImages as Prisma.InputJsonValue;
    }
    if (patch.heroImage !== undefined) data.heroImage = patch.heroImage;
    if (patch.caption !== undefined) data.caption = patch.caption;
    if (patch.type !== undefined) data.type = patch.type;
    if (patch.tags !== undefined) data.tags = patch.tags as Prisma.InputJsonValue;
    if (patch.links !== undefined) data.links = patch.links as Prisma.InputJsonValue;
    if (patch.backgroundId !== undefined) data.backgroundId = patch.backgroundId;
    if (patch.genState !== undefined) data.genState = patch.genState;
    if (patch.shipMode !== undefined) data.shipMode = patch.shipMode;
    if (patch.shippedAt !== undefined) {
      data.shippedAt = patch.shippedAt ? new Date(patch.shippedAt) : null;
    }

    const row = await prisma.rampPost.update({ where: { id }, data });
    return rampPostToDto(row);
  },

  /** Append a generated image URL and mark the post generated. */
  async addGeneratedImage(id: string, url: string) {
    const prisma = requirePrisma();
    const existing = await prisma.rampPost.findUnique({ where: { id } });
    if (!existing) return null;
    const next = [...asStringArray(existing.generatedImages), url];
    const row = await prisma.rampPost.update({
      where: { id },
      data: {
        generatedImages: next as Prisma.InputJsonValue,
        genState: "done",
        status: existing.status === "shipped" ? existing.status : "generated",
      },
    });
    return rampPostToDto(row);
  },

  async remove(id: string) {
    const prisma = requirePrisma();
    await prisma.rampPost.delete({ where: { id } });
  },
};
