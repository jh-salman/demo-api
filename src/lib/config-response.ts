import type { Request } from "express";
import type { S1DemoSlotId, SalonxV2AdminConfig } from "./salonx-config.js";
import { S1_DEMO_SLOT_IDS, projectActiveBrandForWeb } from "./salonx-config.js";
import { publicSiteOrigin } from "./public-url.js";

function absolutizeUrl(url: string, base: string): string {
  if (!url || !url.startsWith("/") || url.startsWith("//")) return url;
  const b = base.replace(/\/$/, "");
  return `${b}${url}`;
}

/** Turn relative `/uploads/...` into absolute URLs for every brand. */
export function absolutizeConfigImages(
  config: SalonxV2AdminConfig,
  origin: string,
): SalonxV2AdminConfig {
  const next = structuredClone(config);
  for (const brand of next.brands) {
    for (const slot of S1_DEMO_SLOT_IDS as S1DemoSlotId[]) {
      brand.s1Demo.images[slot] = absolutizeUrl(brand.s1Demo.images[slot], origin);
    }
    brand.s2.image = absolutizeUrl(brand.s2.image, origin);
    brand.s4.image = absolutizeUrl(brand.s4.image, origin);
    if (brand.s4.headerLogo) {
      brand.s4.headerLogo = absolutizeUrl(brand.s4.headerLogo, origin);
    }
    brand.s5.image = absolutizeUrl(brand.s5.image, origin);
  }
  return next;
}

function uploadStorageLabel(): "cloudinary" | "vercel-blob" | "local-disk" {
  if (
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  ) {
    return "cloudinary";
  }
  if (process.env.BLOB_READ_WRITE_TOKEN) return "vercel-blob";
  return "local-disk";
}

export function configJsonWithMeta(
  config: SalonxV2AdminConfig,
  request: Request,
  /** From `webProjectionAt` / file publish marker — salonx-web-v2 applies when this changes. */
  configRevision?: string,
) {
  const origin = publicSiteOrigin(request);
  const body = absolutizeConfigImages(config, origin);
  const projection = projectActiveBrandForWeb(body);
  return {
    ...body,
    primaryHex: projection.primaryHex,
    s1Demo: projection.s1Demo,
    _meta: {
      uploads: uploadStorageLabel(),
      config: process.env.DATABASE_URL?.trim() ? "postgres" : "file",
      publicBaseUrl: origin,
      configRevision: configRevision ?? "",
    },
  };
}
