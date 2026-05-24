import {
  addSlotVariantFromLegacy,
  isSlotAdjust,
  clampAdjust,
  newS1VariantId,
  patchS1DemoSlotLegacy,
  type S1DemoSlotAdjust,
  type S1DemoSlotId,
  type S1DemoSlotMediaKind,
  type S1DemoWithVariants,
} from "./s1-demo-variants.js";

export const MAX_S1_SLOT_UPLOAD_HISTORY = 15;

export type S1MediaPickMode = "replace" | "newUpload" | "addVariant";

export type S1DemoUploadHistoryItem = {
  id: string;
  url: string;
  kind: S1DemoSlotMediaKind;
  adjust: S1DemoSlotAdjust;
  uploadedAt: string;
};

export type S1DemoWithHistory = S1DemoWithVariants & {
  uploadHistory?: Partial<Record<S1DemoSlotId, S1DemoUploadHistoryItem[]>>;
};

const S1_SLOTS: S1DemoSlotId[] = ["topBar", "hero", "promo", "curveStrip"];

function inferKindFromUrl(url: string): S1DemoSlotMediaKind {
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url.trim()) ? "video" : "image";
}

function normalizeHistoryItem(raw: unknown): S1DemoUploadHistoryItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const url = typeof o.url === "string" ? o.url.trim() : "";
  if (!url) return null;
  const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : newS1VariantId();
  const kind: S1DemoSlotMediaKind =
    o.kind === "video" ? "video" : o.kind === "image" ? "image" : inferKindFromUrl(url);
  const adjust = isSlotAdjust(o.adjust)
    ? clampAdjust(o.adjust)
    : clampAdjust({ scale: 1, rotate: 0, tx: 0, ty: 0, fit: "contain" });
  const uploadedAt =
    typeof o.uploadedAt === "string" && o.uploadedAt.trim()
      ? o.uploadedAt.trim()
      : new Date(0).toISOString();
  return { id, url, kind, adjust, uploadedAt };
}

export function normalizeUploadHistoryField(
  raw: unknown,
): Partial<Record<S1DemoSlotId, S1DemoUploadHistoryItem[]>> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Partial<Record<S1DemoSlotId, S1DemoUploadHistoryItem[]>> = {};
  for (const slot of S1_SLOTS) {
    const list = (raw as Record<string, unknown>)[slot];
    if (!Array.isArray(list)) continue;
    const items: S1DemoUploadHistoryItem[] = [];
    for (const entry of list) {
      const item = normalizeHistoryItem(entry);
      if (!item) continue;
      if (items.some((x) => x.url === item.url)) continue;
      items.push(item);
      if (items.length >= MAX_S1_SLOT_UPLOAD_HISTORY) break;
    }
    if (items.length > 0) out[slot] = items;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function mergeUploadHistories(
  s1Demo: S1DemoWithHistory,
  incoming: Partial<Record<S1DemoSlotId, S1DemoUploadHistoryItem[]>>,
): S1DemoWithHistory {
  let next = s1Demo;
  for (const slot of S1_SLOTS) {
    const items = incoming[slot];
    if (!items?.length) continue;
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const item = items[i];
      next = appendUploadHistory(next, slot, {
        url: item.url,
        kind: item.kind,
        adjust: item.adjust,
      });
    }
  }
  return next;
}

export function getSlotUploadHistory(
  s1Demo: S1DemoWithHistory,
  slot: S1DemoSlotId,
): S1DemoUploadHistoryItem[] {
  return (s1Demo.uploadHistory?.[slot] ?? []).slice(0, MAX_S1_SLOT_UPLOAD_HISTORY);
}

function historyEntryFromSlot(
  url: string,
  kind: S1DemoSlotMediaKind,
  adjust: S1DemoSlotAdjust,
  existingId?: string,
): S1DemoUploadHistoryItem {
  return {
    id: existingId ?? newS1VariantId(),
    url: url.trim(),
    kind,
    adjust: clampAdjust(adjust),
    uploadedAt: new Date().toISOString(),
  };
}

export function appendUploadHistory(
  s1Demo: S1DemoWithHistory,
  slot: S1DemoSlotId,
  entry: {
    url: string;
    kind: S1DemoSlotMediaKind;
    adjust: S1DemoSlotAdjust;
  },
): S1DemoWithHistory {
  const url = entry.url.trim();
  if (!url) return s1Demo;

  const prev = [...(s1Demo.uploadHistory?.[slot] ?? [])];
  const existing = prev.find((item) => item.url === url);
  const withoutDup = prev.filter((item) => item.url !== url);
  const nextItem = historyEntryFromSlot(url, entry.kind, entry.adjust, existing?.id);
  const items = [nextItem, ...withoutDup].slice(0, MAX_S1_SLOT_UPLOAD_HISTORY);
  return {
    ...s1Demo,
    uploadHistory: {
      ...(s1Demo.uploadHistory ?? {}),
      [slot]: items,
    },
  };
}

export function seedUploadHistoryFromSlotState(s1Demo: S1DemoWithHistory): S1DemoWithHistory {
  let next = s1Demo;
  for (const slot of S1_SLOTS) {
    if ((next.uploadHistory?.[slot]?.length ?? 0) > 0) continue;

    const url = s1Demo.images[slot]?.trim();
    if (url) {
      const kind = s1Demo.mediaKinds?.[slot] ?? inferKindFromUrl(url);
      next = appendUploadHistory(next, slot, {
        url,
        kind,
        adjust: s1Demo.adjust[slot],
      });
    }
    const variantItems = s1Demo.variants?.[slot]?.items ?? [];
    for (const item of variantItems) {
      next = appendUploadHistory(next, slot, {
        url: item.url,
        kind: item.kind,
        adjust: item.adjust,
      });
    }
  }
  return next;
}

export function patchS1DemoSlotWithHistory(
  s1Demo: S1DemoWithHistory,
  slot: S1DemoSlotId,
  patch: {
    url?: string;
    adjust?: S1DemoSlotAdjust;
    kind?: S1DemoSlotMediaKind;
  },
): S1DemoWithHistory {
  let next = patchS1DemoSlotLegacy(s1Demo, slot, patch) as S1DemoWithHistory;
  const url = (patch.url?.trim() || next.images[slot]?.trim()) ?? "";
  if (url) {
    const kind = patch.kind ?? next.mediaKinds?.[slot] ?? inferKindFromUrl(url);
    const adjust = patch.adjust ?? next.adjust[slot];
    next = appendUploadHistory(next, slot, { url, kind, adjust });
  }
  return next;
}

export function applyHistoryToSlot(
  s1Demo: S1DemoWithHistory,
  slot: S1DemoSlotId,
  historyItem: S1DemoUploadHistoryItem,
  mode: S1MediaPickMode,
): S1DemoWithHistory {
  const { url, kind, adjust } = historyItem;
  if (mode === "addVariant") {
    const next = addSlotVariantFromLegacy(s1Demo, slot, url, kind, adjust) as S1DemoWithHistory;
    return appendUploadHistory(next, slot, { url, kind, adjust });
  }
  return patchS1DemoSlotWithHistory(s1Demo, slot, { url, kind, adjust });
}
