import { normalizeRampPostStylePreset } from "./ramp-ai-prompts.js";

export type RampTagDto = { label: string; on: boolean };

export const RAMP_POST_TYPE_LABELS = [
  "Curiosity",
  "Professional",
  "Hype / Event",
  "Before / After",
] as const;

export type RampPostTypeLabel = (typeof RAMP_POST_TYPE_LABELS)[number];

const POST_TYPE_TO_STYLE: Record<string, string> = {
  Curiosity: "curiosity",
  Professional: "transformation",
  "Hype / Event": "event",
  "Before / After": "transformation",
};

const ARMED_POST_TYPES = new Set<string>(["Before / After"]);

export function postTypeToPostStyle(postType?: string | null): string {
  const key = String(postType || "Curiosity").trim();
  return POST_TYPE_TO_STYLE[key] || "curiosity";
}

export function isArmedPostType(postType?: string | null): boolean {
  return ARMED_POST_TYPES.has(String(postType || "").trim());
}

export function normalizePostTypeLabel(raw?: string): RampPostTypeLabel {
  const key = String(raw || "Curiosity").trim();
  if ((RAMP_POST_TYPE_LABELS as readonly string[]).includes(key)) {
    return key as RampPostTypeLabel;
  }
  return "Curiosity";
}

export function normalizeTagsInput(raw: unknown): RampTagDto[] {
  if (!Array.isArray(raw)) return [];
  const out: RampTagDto[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const label = item.trim();
      if (label) out.push({ label, on: true });
      continue;
    }
    if (item && typeof item === "object") {
      const label = String((item as { label?: string }).label || "").trim();
      if (!label) continue;
      const on = (item as { on?: boolean }).on !== false;
      out.push({ label, on });
    }
  }
  return out.slice(0, 16);
}

export function tagsToStringList(tags: RampTagDto[]): string[] {
  return tags
    .filter((t) => t.on)
    .map((t) => t.label.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export function normalizeLinksInput(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const u = item.trim();
      if (u) out.push(u);
      continue;
    }
    if (item && typeof item === "object") {
      const u = String((item as { url?: string }).url || "").trim();
      if (u) out.push(u);
    }
  }
  return out.slice(0, 4);
}

export function normalizePostStyleField(raw?: string, postType?: string): string {
  const fromType = postType ? postTypeToPostStyle(postType) : "";
  if (fromType) return normalizeRampPostStylePreset(fromType);
  return normalizeRampPostStylePreset(raw || "curiosity");
}
