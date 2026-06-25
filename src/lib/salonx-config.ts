/** Multi-brand build config + salonx-web-v2 theme + stylist (s1) demo payload (active brand). */

import {
  normalizeS1DemoVariantsField,
  syncLegacyFromActiveVariants,
  type S1DemoWithVariants,
} from "./s1-demo-variants.js";
import {
  normalizeUploadHistoryField,
  seedUploadHistoryFromSlotState,
  mergeUploadHistories,
  type S1DemoWithHistory,
} from "./s1-demo-upload-history.js";

export type S1DemoSlotId = "topBar" | "hero" | "promo" | "curveStrip";

export type S1DemoSlotAdjust = {
  scale: number;
  rotate: number;
  tx: number;
  ty: number;
  fit: "cover" | "contain";
};

/** Per-slot media; only `curveStrip` uses `video` today (Build Station + app). */
export type S1DemoSlotMediaKind = "image" | "video";

/** Use after exporting a pixel-perfect crop from Build Station (no pinch UI needed). */
export const CROPPED_SLOT_ADJUST: S1DemoSlotAdjust = {
  scale: 1,
  rotate: 0,
  tx: 0,
  ty: 0,
  fit: "cover",
};

export type BuildScreenId = "s1" | "s2" | "s4" | "s5";

/** Tab order in Build Station: marquee (login) first, then stylist home, then S4/S5. */
export const BUILD_SCREEN_IDS: BuildScreenId[] = ["s2", "s1", "s4", "s5"];

/** Product names in Build Station (s1 = stylist home slots; s2 = login marquee — full-bleed + centered login). */
export const BUILD_SCREEN_LABELS: Record<BuildScreenId, string> = {
  s1: "Stylist",
  s2: "Marquee",
  s4: "Climax",
  s5: "Screen 5",
};

export const MAX_BRANDS = 10;

export const SALONX_PRIMARY_STORAGE_KEY = "salonx.primaryHex";
export const S1_DEMO_SESSION_STORAGE_KEY = "@salonx/s1-demo-image/v1";

export const DEFAULT_PRIMARY_HEX = "#3b82f6";

/** Same labels + hex as salonx-web-v2 `SettingsScreen.jsx` PRESETS. */
export const SALONX_THEME_PRESETS: readonly { label: string; hex: string }[] = [
  { label: "Blue", hex: DEFAULT_PRIMARY_HEX },
  { label: "Orange", hex: "#f97316" },
  { label: "Pink", hex: "#ec4899" },
  { label: "Lime", hex: "#DFFF00" },
  { label: "White", hex: "#FFFFFF" },
  { label: "Charcoal", hex: "#1C1C1C" },
  { label: "Gray", hex: "#545454" },
  { label: "Burgundy", hex: "#5E001F" },
];

const S1_SLOTS: S1DemoSlotId[] = ["topBar", "hero", "promo", "curveStrip"];

export const S1_DEMO_SLOT_IDS: readonly S1DemoSlotId[] = S1_SLOTS;

/** S2 / S4 / S5: single hero image + same adjust math as one S1 slot (until web has richer layouts). */
export type SimpleScreenConfig = {
  image: string;
  adjust: S1DemoSlotAdjust;
  /** Marquee (s2) only: `image` URL points to a video asset when `video`. */
  mediaKind?: "image" | "video";
  /** Climax (s4) only: co-brand header logo (salonx-web-v2 `.climax-brandbar__logo`). */
  headerLogo?: string;
  /** Climax (s4) only: pan/zoom for `headerLogo`. */
  headerLogoAdjust?: S1DemoSlotAdjust;
};

export type BrandProfile = {
  id: string;
  name: string;
  primaryHex: string;
  s1Demo: {
    images: Record<S1DemoSlotId, string>;
    adjust: Record<S1DemoSlotId, S1DemoSlotAdjust>;
    /** Optional; omitted slot defaults to `image`. */
    mediaKinds?: Partial<Record<S1DemoSlotId, S1DemoSlotMediaKind>>;
    variants?: Partial<
      Record<
        S1DemoSlotId,
        import("./s1-demo-variants.js").S1DemoSlotVariantSet
      >
    >;
    uploadHistory?: Partial<
      Record<
        S1DemoSlotId,
        import("./s1-demo-upload-history.js").S1DemoUploadHistoryItem[]
      >
    >;
  };
  s2: SimpleScreenConfig;
  s4: SimpleScreenConfig;
  s5: SimpleScreenConfig;
  /** When true, that screen’s assets/theme slice should not be editable in Build Station. */
  screenLocks: Record<BuildScreenId, boolean>;
};

export type SalonxV2AdminConfig = {
  version: 2;
  activeBrandId: string;
  brands: BrandProfile[];
};

function defaultSlotAdjust(): S1DemoSlotAdjust {
  return {
    scale: 1,
    rotate: 0,
    tx: 0,
    ty: 0,
    fit: "contain",
  };
}

function emptyImages(): Record<S1DemoSlotId, string> {
  return { topBar: "", hero: "", promo: "", curveStrip: "" };
}

function defaultAdjust(): Record<S1DemoSlotId, S1DemoSlotAdjust> {
  return {
    topBar: defaultSlotAdjust(),
    hero: defaultSlotAdjust(),
    promo: defaultSlotAdjust(),
    curveStrip: defaultSlotAdjust(),
  };
}

function emptySimpleScreen(): SimpleScreenConfig {
  return { image: "", adjust: defaultSlotAdjust(), mediaKind: "image" };
}

function defaultScreenLocks(): Record<BuildScreenId, boolean> {
  return { s1: false, s2: false, s4: false, s5: false };
}

export function createBrand(id: string, name: string): BrandProfile {
  return {
    id,
    name,
    primaryHex: DEFAULT_PRIMARY_HEX,
    s1Demo: {
      images: emptyImages(),
      adjust: defaultAdjust(),
      mediaKinds: {},
    },
    s2: emptySimpleScreen(),
    s4: emptySimpleScreen(),
    s5: emptySimpleScreen(),
    screenLocks: defaultScreenLocks(),
  };
}

export const defaultConfig: SalonxV2AdminConfig = (() => {
  const first = createBrand("default", "Default");
  return {
    version: 2,
    activeBrandId: first.id,
    brands: [first],
  };
})();

export function normalizePrimaryHex(hex: string | undefined): string {
  let t = (hex || DEFAULT_PRIMARY_HEX).trim();
  if (!t.startsWith("#")) t = `#${t}`;
  if (/^#[0-9a-fA-F]{3}$/.test(t)) {
    const [r, g, b] = [t[1], t[2], t[3]];
    t = `#${r}${r}${g}${g}${b}${b}`;
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(t)) return DEFAULT_PRIMARY_HEX;
  return t.toLowerCase();
}

export function isSlotAdjust(v: unknown): v is S1DemoSlotAdjust {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.scale === "number" &&
    typeof o.rotate === "number" &&
    typeof o.tx === "number" &&
    typeof o.ty === "number" &&
    (o.fit === "cover" || o.fit === "contain")
  );
}

export function clampAdjust(a: S1DemoSlotAdjust): S1DemoSlotAdjust {
  return {
    scale: Math.min(60, Math.max(0.35, a.scale)),
    rotate: Math.min(180, Math.max(-180, a.rotate)),
    tx: Math.min(50, Math.max(-50, a.tx)),
    ty: Math.min(50, Math.max(-50, a.ty)),
    fit: a.fit,
  };
}

function normalizeSimpleScreen(v: unknown): SimpleScreenConfig {
  const base = emptySimpleScreen();
  if (!v || typeof v !== "object") return base;
  const o = v as Record<string, unknown>;
  if (typeof o.image === "string") base.image = o.image;
  if (typeof o.headerLogo === "string") base.headerLogo = o.headerLogo.trim();
  if (isSlotAdjust(o.headerLogoAdjust)) base.headerLogoAdjust = clampAdjust(o.headerLogoAdjust);
  if (isSlotAdjust(o.adjust)) base.adjust = clampAdjust(o.adjust);
  if (o.mediaKind === "video") base.mediaKind = "video";
  else base.mediaKind = "image";
  return base;
}

/** Normalize one brand from file/API. */
export function normalizeBrand(b: unknown, fallbackId: string, fallbackName: string): BrandProfile {
  const base = createBrand(fallbackId, fallbackName);
  if (!b || typeof b !== "object") return base;
  const o = b as Record<string, unknown>;
  if (typeof o.id === "string" && o.id.trim()) base.id = o.id.trim();
  if (typeof o.name === "string") base.name = o.name.trim() || fallbackName;
  base.primaryHex = normalizePrimaryHex(
    typeof o.primaryHex === "string" ? o.primaryHex : base.primaryHex,
  );

  const s1 = o.s1Demo;
  if (s1 && typeof s1 === "object") {
    const im = (s1 as { images?: unknown }).images;
    if (im && typeof im === "object") {
      for (const slot of S1_SLOTS) {
        const val = (im as Record<string, unknown>)[slot];
        if (typeof val === "string") base.s1Demo.images[slot] = val;
      }
    }
    const ad = (s1 as { adjust?: unknown }).adjust;
    if (ad && typeof ad === "object") {
      for (const slot of S1_SLOTS) {
        const a = (ad as Record<string, unknown>)[slot];
        if (isSlotAdjust(a)) base.s1Demo.adjust[slot] = clampAdjust(a);
      }
    }
    const mk = (s1 as { mediaKinds?: unknown }).mediaKinds;
    if (mk && typeof mk === "object") {
      const out: Partial<Record<S1DemoSlotId, S1DemoSlotMediaKind>> = {
        ...(base.s1Demo.mediaKinds ?? {}),
      };
      for (const slot of S1_SLOTS) {
        const v = (mk as Record<string, unknown>)[slot];
        if (v === "video") out[slot] = "video";
        else if (v === "image") out[slot] = "image";
      }
      base.s1Demo.mediaKinds = out;
    }
    const variants = normalizeS1DemoVariantsField(
      (s1 as { variants?: unknown }).variants,
    );
    if (variants) {
      base.s1Demo.variants = variants;
      const synced = syncLegacyFromActiveVariants(base.s1Demo as S1DemoWithVariants);
      base.s1Demo.images = synced.images;
      base.s1Demo.adjust = synced.adjust;
      base.s1Demo.mediaKinds = synced.mediaKinds;
      base.s1Demo.variants = synced.variants;
    }
    const uploadHistory = normalizeUploadHistoryField(
      (s1 as { uploadHistory?: unknown }).uploadHistory,
    );
    let withHistory = base.s1Demo as S1DemoWithHistory;
    if (uploadHistory) {
      withHistory = mergeUploadHistories(withHistory, uploadHistory);
    }
    const seeded = seedUploadHistoryFromSlotState(withHistory);
    base.s1Demo.uploadHistory = seeded.uploadHistory;
  }

  base.s2 = normalizeSimpleScreen(o.s2);
  base.s4 = normalizeSimpleScreen(o.s4);
  base.s5 = normalizeSimpleScreen(o.s5);

  const locks = o.screenLocks;
  if (locks && typeof locks === "object") {
    for (const k of BUILD_SCREEN_IDS) {
      const v = (locks as Record<string, unknown>)[k];
      if (typeof v === "boolean") base.screenLocks[k] = v;
    }
  }

  return base;
}

/** v1 file shape (legacy). */
type LegacyV1 = {
  version?: number;
  primaryHex?: string;
  s1Demo?: {
    images?: Record<string, unknown>;
    adjust?: Record<string, unknown>;
  };
};

function migrateLegacyV1(raw: LegacyV1): SalonxV2AdminConfig {
  const brand = normalizeBrand(
    {
      id: "default",
      name: "Default",
      primaryHex: raw.primaryHex,
      s1Demo: raw.s1Demo,
      s2: {},
      s4: {},
      s5: {},
      screenLocks: {},
    },
    "default",
    "Default",
  );
  return {
    version: 2,
    activeBrandId: brand.id,
    brands: [brand],
  };
}

/**
 * Normalize API/file content into a valid v2 config (migrates legacy v1).
 */
export function mergeWithDefaults(raw: unknown): SalonxV2AdminConfig {
  if (!raw || typeof raw !== "object") {
    return structuredClone(defaultConfig);
  }
  const r = raw as Record<string, unknown>;

  if (r.version === 2 && Array.isArray(r.brands)) {
    const brandsIn = r.brands as unknown[];
    const brands: BrandProfile[] = [];
    for (let i = 0; i < Math.min(MAX_BRANDS, brandsIn.length); i++) {
      const id =
        brandsIn[i] &&
        typeof brandsIn[i] === "object" &&
        typeof (brandsIn[i] as { id?: string }).id === "string"
          ? String((brandsIn[i] as { id: string }).id)
          : `brand-${i}`;
      const name = `Brand ${i + 1}`;
      brands.push(normalizeBrand(brandsIn[i], id, name));
    }
    if (brands.length === 0) {
      return structuredClone(defaultConfig);
    }
    let active =
      typeof r.activeBrandId === "string" && r.activeBrandId.trim()
        ? r.activeBrandId.trim()
        : brands[0].id;
    if (!brands.some((b) => b.id === active)) {
      active = brands[0].id;
    }
    return { version: 2, activeBrandId: active, brands };
  }

  return migrateLegacyV1(r as LegacyV1);
}

export function getActiveBrand(config: SalonxV2AdminConfig): BrandProfile {
  const b = config.brands.find((x) => x.id === config.activeBrandId);
  return b ?? config.brands[0] ?? createBrand("default", "Default");
}

/** Top-level keys salonx-web-v2 `syncFromV2Admin` consumes. */
export function projectActiveBrandForWeb(
  config: SalonxV2AdminConfig,
): { primaryHex: string; s1Demo: BrandProfile["s1Demo"] } {
  const a = getActiveBrand(config);
  return {
    primaryHex: a.primaryHex,
    s1Demo: structuredClone(a.s1Demo),
  };
}

/** Shrink config to one brand for S1 preview while editing. */
export function previewConfigForBrand(brand: BrandProfile): SalonxV2AdminConfig {
  return {
    version: 2,
    activeBrandId: brand.id,
    brands: [structuredClone(brand)],
  };
}

export function patchLegacyFields(
  current: SalonxV2AdminConfig,
  patch: Partial<{
    primaryHex: string;
    s1Demo: {
      images?: Partial<Record<S1DemoSlotId, string>>;
      adjust?: Partial<Record<S1DemoSlotId, S1DemoSlotAdjust>>;
      mediaKinds?: Partial<Record<S1DemoSlotId, S1DemoSlotMediaKind>>;
      variants?: Partial<
        Record<
          S1DemoSlotId,
          import("./s1-demo-variants.js").S1DemoSlotVariantSet
        >
      >;
    };
  }>,
): SalonxV2AdminConfig {
  const next = structuredClone(current);
  const active = getActiveBrand(next);
  const idx = next.brands.findIndex((b) => b.id === active.id);
  if (idx < 0) return next;

  if (typeof patch.primaryHex === "string") {
    next.brands[idx].primaryHex = normalizePrimaryHex(patch.primaryHex);
  }
  if (patch.s1Demo) {
    const { images, adjust } = patch.s1Demo;
    if (images) {
      for (const slot of S1_SLOTS) {
        if (Object.prototype.hasOwnProperty.call(images, slot)) {
          const v = images[slot];
          next.brands[idx].s1Demo.images[slot] = typeof v === "string" ? v : "";
        }
      }
    }
    if (adjust) {
      for (const slot of S1_SLOTS) {
        const a = adjust[slot];
        if (a && isSlotAdjust(a)) {
          next.brands[idx].s1Demo.adjust[slot] = clampAdjust(a);
        }
      }
    }
    const mediaKinds = patch.s1Demo.mediaKinds;
    if (mediaKinds && typeof mediaKinds === "object") {
      const cur = { ...(next.brands[idx].s1Demo.mediaKinds ?? {}) };
      for (const slot of S1_SLOTS) {
        if (!Object.prototype.hasOwnProperty.call(mediaKinds, slot)) continue;
        const v = mediaKinds[slot];
        if (v === "video" || v === "image") cur[slot] = v;
      }
      next.brands[idx].s1Demo.mediaKinds = cur;
    }
    const variantsRaw = patch.s1Demo.variants;
    if (variantsRaw && typeof variantsRaw === "object") {
      const normalized = normalizeS1DemoVariantsField(variantsRaw);
      if (normalized) {
        next.brands[idx].s1Demo.variants = normalized;
        const synced = syncLegacyFromActiveVariants(
          next.brands[idx].s1Demo as S1DemoWithVariants,
        );
        next.brands[idx].s1Demo.images = synced.images;
        next.brands[idx].s1Demo.adjust = synced.adjust;
        next.brands[idx].s1Demo.mediaKinds = synced.mediaKinds;
        next.brands[idx].s1Demo.variants = synced.variants;
      }
    }
  }
  return next;
}

export type ConfigApiPatch = {
  activeBrandId?: string;
  /** Replace one brand entirely (same id must exist, or use addBrand). */
  saveBrand?: BrandProfile;
  addBrand?: { name?: string };
  removeBrandId?: string;
  /** Shallow: only active brand, same shape as legacy PATCH. */
  primaryHex?: string;
  s1Demo?: {
    images?: Partial<Record<S1DemoSlotId, string>>;
    adjust?: Partial<Record<S1DemoSlotId, S1DemoSlotAdjust>>;
    mediaKinds?: Partial<Record<S1DemoSlotId, S1DemoSlotMediaKind>>;
    variants?: Partial<
      Record<
        S1DemoSlotId,
        import("./s1-demo-variants.js").S1DemoSlotVariantSet
      >
    >;
  };
};

export function applyConfigApiPatch(
  current: SalonxV2AdminConfig,
  body: ConfigApiPatch,
): SalonxV2AdminConfig {
  let next = structuredClone(current);

  if (body.primaryHex !== undefined || body.s1Demo !== undefined) {
    next = patchLegacyFields(next, {
      primaryHex: body.primaryHex,
      s1Demo: body.s1Demo,
    });
  }

  if (typeof body.activeBrandId === "string" && body.activeBrandId.trim()) {
    const id = body.activeBrandId.trim();
    if (next.brands.some((b) => b.id === id)) {
      next.activeBrandId = id;
    }
  }

  if (body.addBrand && next.brands.length < MAX_BRANDS) {
    const name =
      typeof body.addBrand.name === "string" && body.addBrand.name.trim()
        ? body.addBrand.name.trim()
        : `Brand ${next.brands.length + 1}`;
    const id =
      typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto
        ? globalThis.crypto.randomUUID()
        : `brand-${Date.now()}`;
    next.brands.push(createBrand(id, name));
  }

  if (typeof body.removeBrandId === "string" && body.removeBrandId) {
    if (next.brands.length <= 1) {
      return next;
    }
    const rid = body.removeBrandId;
    next.brands = next.brands.filter((b) => b.id !== rid);
    if (!next.brands.some((b) => b.id === next.activeBrandId)) {
      next.activeBrandId = next.brands[0].id;
    }
  }

  if (body.saveBrand && typeof body.saveBrand === "object") {
    const sid = typeof body.saveBrand.id === "string" ? body.saveBrand.id : "";
    if (!sid) return next;
    const normalized = normalizeBrand(
      body.saveBrand as unknown,
      sid,
      typeof body.saveBrand.name === "string" ? body.saveBrand.name : "Brand",
    );
    const i = next.brands.findIndex((b) => b.id === sid);
    if (i >= 0) {
      next.brands[i] = normalized;
    }
  }

  return next;
}
