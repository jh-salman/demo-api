import { readConfig, writeConfig } from "../../lib/store.js";
import {
  applyConfigApiPatch,
  getActiveBrand,
  type BrandProfile,
  type SalonxV2AdminConfig,
} from "../../lib/salonx-config.js";

export type RampBrandConfig = {
  defaultBackgroundPosterUrl?: string;
  backgrounds?: Array<{ id?: string; label?: string; url: string }>;
  stylistStyleReferenceUrl?: string;
  clientStyleReferenceUrl?: string;
  /** Face-safe Sharp composite by default — stored in brand config, not env. */
  compositeMode?: "deterministic" | "ai" | "auto";
};

export type RampBackgroundOption = {
  id: string;
  label: string;
  url: string;
  isDefault?: boolean;
};

export type RampBrandDefaults = {
  defaultBackgroundPosterUrl: string;
  backgrounds: RampBackgroundOption[];
  stylistStyleReferenceUrl: string;
  clientStyleReferenceUrl: string;
  compositeMode: "deterministic" | "ai" | "auto";
};

function readBrandRamp(brand: { ramp?: RampBrandConfig }): RampBrandConfig | null {
  const ramp = brand.ramp;
  if (!ramp || typeof ramp !== "object") return null;
  return ramp;
}

function normalizeBackgrounds(
  raw: RampBrandConfig | null,
  envDefault: string,
): RampBackgroundOption[] {
  const items: RampBackgroundOption[] = [];
  const seen = new Set<string>();

  const push = (label: string, url: string, isDefault = false) => {
    const u = String(url || "").trim();
    if (!u || seen.has(u)) return;
    seen.add(u);
    items.push({
      id: `bg_${items.length + 1}`,
      label: label || "Background",
      url: u,
      isDefault,
    });
  };

  if (envDefault) push("Saved default", envDefault, true);

  for (const row of raw?.backgrounds || []) {
    if (!row || typeof row !== "object") continue;
    const url = String((row as { url?: string }).url || "").trim();
    const label = String((row as { label?: string }).label || "Scene").trim();
    push(label, url, false);
  }

  const configDefault = String(raw?.defaultBackgroundPosterUrl || "").trim();
  if (configDefault && !seen.has(configDefault)) {
    items.unshift({
      id: "default",
      label: "Saved default",
      url: configDefault,
      isDefault: true,
    });
  } else if (items.length && !items.some((b) => b.isDefault)) {
    items[0].isDefault = true;
  }

  return items;
}

/** Brand + env defaults for RAMP poster backgrounds and style refs. */
export async function resolveRampBrandDefaults(brandSlug?: string): Promise<RampBrandDefaults> {
  const envDefault = String(process.env.RAMP_DEFAULT_BACKGROUND_URL || "").trim();
  const envStylistRef = String(process.env.RAMP_STYLIST_STYLE_REF_URL || "").trim();
  const envClientRef = String(process.env.RAMP_CLIENT_STYLE_REF_URL || "").trim();

  let ramp: RampBrandConfig | null = null;
  try {
    const config = await readConfig();
    const slug = String(brandSlug || "").trim().toLowerCase();
    const brand =
      config.brands.find(
        (b) =>
          b.id.toLowerCase() === slug ||
          b.name.toLowerCase().replace(/\s+/g, "-") === slug,
      ) || getActiveBrand(config);
    ramp = readBrandRamp(brand);
  } catch {
    ramp = null;
  }

  const defaultBackgroundPosterUrl =
    String(ramp?.defaultBackgroundPosterUrl || "").trim() || envDefault;

  return {
    defaultBackgroundPosterUrl,
    backgrounds: normalizeBackgrounds(ramp, envDefault || defaultBackgroundPosterUrl),
    stylistStyleReferenceUrl:
      String(ramp?.stylistStyleReferenceUrl || "").trim() || envStylistRef,
    clientStyleReferenceUrl:
      String(ramp?.clientStyleReferenceUrl || "").trim() || envClientRef,
    compositeMode: resolveStoredCompositeMode(ramp),
  };
}

function resolveStoredCompositeMode(ramp: RampBrandConfig | null): "deterministic" | "ai" | "auto" {
  const raw = String(ramp?.compositeMode || process.env.RAMP_COMPOSITE_MODE || "deterministic")
    .trim()
    .toLowerCase();
  if (raw === "ai" || raw === "auto") return raw;
  return "deterministic";
}

function findBrandForSlug(config: SalonxV2AdminConfig, brandSlug?: string): BrandProfile {
  const slug = String(brandSlug || "").trim().toLowerCase();
  if (slug) {
    const match = config.brands.find(
      (b) =>
        b.id.toLowerCase() === slug ||
        b.name.toLowerCase().replace(/\s+/g, "-") === slug,
    );
    if (match) return match;
  }
  return getActiveBrand(config);
}

/** Persist an uploaded background into `brand.ramp` (survives restart, no env vars). */
export async function saveRampBackgroundToBrand(input: {
  brandSlug?: string;
  url: string;
  label?: string;
  setAsDefault?: boolean;
}): Promise<{
  defaultBackgroundPosterUrl: string;
  items: RampBackgroundOption[];
}> {
  const url = String(input.url || "").trim();
  if (!url) throw new Error("Background url is required");

  const config = await readConfig();
  const brand = findBrandForSlug(config, input.brandSlug);
  const ramp = brand.ramp || {};
  const backgrounds = Array.isArray(ramp.backgrounds) ? [...ramp.backgrounds] : [];
  const label = String(input.label || "Uploaded").trim() || "Uploaded";

  const existingIdx = backgrounds.findIndex(
    (row) => String(row.url || "").trim() === url,
  );
  if (existingIdx >= 0) {
    backgrounds[existingIdx] = { ...backgrounds[existingIdx], label, url };
  } else {
    backgrounds.push({
      id: `bg_${backgrounds.length + 1}`,
      label,
      url,
    });
  }

  const hadDefault = Boolean(String(ramp.defaultBackgroundPosterUrl || "").trim());
  const shouldDefault = input.setAsDefault !== false;
  const defaultBackgroundPosterUrl =
    shouldDefault || !hadDefault
      ? url
      : String(ramp.defaultBackgroundPosterUrl || "").trim();

  const updatedRamp: RampBrandConfig = {
    ...ramp,
    defaultBackgroundPosterUrl,
    backgrounds,
    compositeMode: ramp.compositeMode || "deterministic",
  };

  const next = applyConfigApiPatch(config, {
    saveBrand: { ...brand, ramp: updatedRamp },
  });
  await writeConfig(next, { publishToApp: true });

  return {
    defaultBackgroundPosterUrl,
    items: normalizeBackgrounds(updatedRamp, ""),
  };
}

export function resolveCompositeMode(ramp?: RampBrandConfig | null): "deterministic" | "ai" | "auto" {
  return resolveStoredCompositeMode(ramp || null);
}
