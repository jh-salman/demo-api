export type S1DemoSlotVariantItem = {
  id: string;
  url: string;
  kind: S1DemoSlotMediaKind;
  adjust: S1DemoSlotAdjust;
};

export type S1DemoSlotMediaKind = "image" | "video";

export type S1DemoSlotAdjust = {
  scale: number;
  rotate: number;
  tx: number;
  ty: number;
  fit: "cover" | "contain";
};

export type S1DemoSlotId = "topBar" | "hero" | "promo" | "curveStrip";

export type S1DemoSlotVariantSet = {
  activeIndex: number;
  items: S1DemoSlotVariantItem[];
};

export type S1DemoWithVariants = {
  images: Record<S1DemoSlotId, string>;
  adjust: Record<S1DemoSlotId, S1DemoSlotAdjust>;
  mediaKinds?: Partial<Record<S1DemoSlotId, S1DemoSlotMediaKind>>;
  variants?: Partial<Record<S1DemoSlotId, S1DemoSlotVariantSet>>;
};

const S1_SLOTS: S1DemoSlotId[] = ["topBar", "hero", "promo", "curveStrip"];

export const MAX_S1_SLOT_VARIANTS = 3;

function isSlotAdjust(v: unknown): v is S1DemoSlotAdjust {
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

function clampAdjust(a: S1DemoSlotAdjust): S1DemoSlotAdjust {
  return {
    scale: Math.min(60, Math.max(0.35, a.scale)),
    rotate: Math.min(180, Math.max(-180, a.rotate)),
    tx: Math.min(50, Math.max(-50, a.tx)),
    ty: Math.min(50, Math.max(-50, a.ty)),
    fit: a.fit,
  };
}

export function newS1VariantId(): string {
  if (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }
  return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function clampActiveIndex(index: number, len: number): number {
  if (len <= 0) return 0;
  const n = Math.floor(index);
  if (!Number.isFinite(n)) return 0;
  return Math.min(len - 1, Math.max(0, n));
}

function inferKindFromUrl(url: string): S1DemoSlotMediaKind {
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url.trim()) ? "video" : "image";
}

function normalizeVariantItem(raw: unknown): S1DemoSlotVariantItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const url = typeof o.url === "string" ? o.url.trim() : "";
  if (!url) return null;
  const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : newS1VariantId();
  const kind: S1DemoSlotMediaKind =
    o.kind === "video" ? "video" : o.kind === "image" ? "image" : inferKindFromUrl(url);
  const adjust = isSlotAdjust(o.adjust) ? clampAdjust(o.adjust) : clampAdjust({
    scale: 1,
    rotate: 0,
    tx: 0,
    ty: 0,
    fit: "contain",
  });
  return { id, url, kind, adjust };
}

export function normalizeVariantSet(raw: unknown): S1DemoSlotVariantSet | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const itemsIn = Array.isArray(o.items) ? o.items : [];
  const items: S1DemoSlotVariantItem[] = [];
  for (const entry of itemsIn) {
    const item = normalizeVariantItem(entry);
    if (!item) continue;
    if (items.some((x) => x.url === item.url)) continue;
    items.push(item);
    if (items.length >= MAX_S1_SLOT_VARIANTS) break;
  }
  if (items.length === 0) return null;
  const activeIndex = clampActiveIndex(
    typeof o.activeIndex === "number" ? o.activeIndex : 0,
    items.length,
  );
  return { activeIndex, items };
}

export function normalizeS1DemoVariantsField(
  variantsRaw: unknown,
): Partial<Record<S1DemoSlotId, S1DemoSlotVariantSet>> | undefined {
  if (!variantsRaw || typeof variantsRaw !== "object") return undefined;
  const out: Partial<Record<S1DemoSlotId, S1DemoSlotVariantSet>> = {};
  for (const slot of S1_SLOTS) {
    const set = normalizeVariantSet((variantsRaw as Record<string, unknown>)[slot]);
    if (set) out[slot] = set;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function syncLegacyFromActiveVariants(s1Demo: S1DemoWithVariants): S1DemoWithVariants {
  if (!s1Demo.variants) return s1Demo;
  const next: S1DemoWithVariants = {
    ...s1Demo,
    images: { ...s1Demo.images },
    adjust: { ...s1Demo.adjust },
    mediaKinds: { ...(s1Demo.mediaKinds ?? {}) },
    variants: { ...s1Demo.variants },
  };
  for (const slot of S1_SLOTS) {
    const set = next.variants?.[slot];
    if (!set?.items.length) continue;
    const idx = clampActiveIndex(set.activeIndex, set.items.length);
    const item = set.items[idx];
    if (!item) continue;
    next.images[slot] = item.url;
    next.adjust[slot] = clampAdjust(item.adjust);
    next.mediaKinds = { ...next.mediaKinds, [slot]: item.kind };
    next.variants = {
      ...next.variants,
      [slot]: { ...set, activeIndex: idx },
    };
  }
  return next;
}

export function getSlotVariantSet(
  s1Demo: S1DemoWithVariants,
  slot: S1DemoSlotId,
): S1DemoSlotVariantSet | null {
  const set = s1Demo.variants?.[slot];
  if (!set?.items.length) return null;
  const activeIndex = clampActiveIndex(set.activeIndex, set.items.length);
  return { ...set, activeIndex };
}

export function slotHasMultipleVariants(s1Demo: S1DemoWithVariants, slot: S1DemoSlotId): boolean {
  const set = getSlotVariantSet(s1Demo, slot);
  return Boolean(set && set.items.length > 1);
}

export function activateSlotVariant(
  s1Demo: S1DemoWithVariants,
  slot: S1DemoSlotId,
  index: number,
): S1DemoWithVariants {
  const set = getSlotVariantSet(s1Demo, slot);
  if (!set) return s1Demo;
  const activeIndex = clampActiveIndex(index, set.items.length);
  const variants = { ...(s1Demo.variants ?? {}), [slot]: { ...set, activeIndex } };
  return syncLegacyFromActiveVariants({ ...s1Demo, variants });
}

export function cycleSlotVariant(
  s1Demo: S1DemoWithVariants,
  slot: S1DemoSlotId,
  delta = 1,
): S1DemoWithVariants {
  const set = getSlotVariantSet(s1Demo, slot);
  if (!set || set.items.length <= 1) return s1Demo;
  const len = set.items.length;
  const nextIndex = (set.activeIndex + delta + len * 8) % len;
  return activateSlotVariant(s1Demo, slot, nextIndex);
}

export function updateActiveVariantFromLegacy(
  s1Demo: S1DemoWithVariants,
  slot: S1DemoSlotId,
): S1DemoWithVariants {
  const set = getSlotVariantSet(s1Demo, slot);
  if (!set) return s1Demo;
  const idx = clampActiveIndex(set.activeIndex, set.items.length);
  const url = s1Demo.images[slot]?.trim() ?? "";
  if (!url) return clearSlotVariants(s1Demo, slot);
  const kind = s1Demo.mediaKinds?.[slot] ?? inferKindFromUrl(url);
  const adjust = clampAdjust(s1Demo.adjust[slot]);
  const items = set.items.map((item, i) =>
    i === idx ? { ...item, url, kind, adjust } : item,
  );
  const variants = { ...(s1Demo.variants ?? {}), [slot]: { activeIndex: idx, items } };
  return syncLegacyFromActiveVariants({ ...s1Demo, variants });
}

export function addSlotVariantFromLegacy(
  s1Demo: S1DemoWithVariants,
  slot: S1DemoSlotId,
  url: string,
  kind: S1DemoSlotMediaKind,
  adjust: S1DemoSlotAdjust,
): S1DemoWithVariants {
  const trimmed = url.trim();
  if (!trimmed) return s1Demo;

  const currentUrl = s1Demo.images[slot]?.trim() ?? "";
  const currentKind = s1Demo.mediaKinds?.[slot] ?? inferKindFromUrl(currentUrl);
  const currentAdjust = clampAdjust(s1Demo.adjust[slot]);

  let set = getSlotVariantSet(s1Demo, slot);
  let items = set?.items ? [...set.items] : [];

  if (items.length === 0 && currentUrl) {
    items.push({
      id: newS1VariantId(),
      url: currentUrl,
      kind: currentKind,
      adjust: currentAdjust,
    });
  }

  if (items.some((item) => item.url === trimmed)) {
    const dupIndex = items.findIndex((item) => item.url === trimmed);
    return activateSlotVariant(s1Demo, slot, dupIndex);
  }

  if (items.length >= MAX_S1_SLOT_VARIANTS) return s1Demo;

  items.push({
    id: newS1VariantId(),
    url: trimmed,
    kind,
    adjust: clampAdjust(adjust),
  });

  const activeIndex = items.length - 1;
  const variants = { ...(s1Demo.variants ?? {}), [slot]: { activeIndex, items } };
  return syncLegacyFromActiveVariants({ ...s1Demo, variants });
}

export function clearSlotVariants(
  s1Demo: S1DemoWithVariants,
  slot: S1DemoSlotId,
): S1DemoWithVariants {
  if (!s1Demo.variants?.[slot]) return s1Demo;
  const variants = { ...s1Demo.variants };
  delete variants[slot];
  return {
    ...s1Demo,
    variants: Object.keys(variants).length > 0 ? variants : undefined,
  };
}

export function patchS1DemoSlotLegacy(
  s1Demo: S1DemoWithVariants,
  slot: S1DemoSlotId,
  patch: {
    url?: string;
    adjust?: S1DemoSlotAdjust;
    kind?: S1DemoSlotMediaKind;
  },
): S1DemoWithVariants {
  const next: S1DemoWithVariants = {
    ...s1Demo,
    images: { ...s1Demo.images },
    adjust: { ...s1Demo.adjust },
    mediaKinds: { ...(s1Demo.mediaKinds ?? {}) },
  };

  if (patch.url !== undefined) next.images[slot] = patch.url;
  if (patch.adjust) next.adjust[slot] = clampAdjust(patch.adjust);
  if (patch.kind) next.mediaKinds = { ...next.mediaKinds, [slot]: patch.kind };

  if (getSlotVariantSet(next, slot)) {
    return updateActiveVariantFromLegacy(next, slot);
  }
  return next;
}
