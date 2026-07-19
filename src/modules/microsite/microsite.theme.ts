/** Salon microsite landing theme — layout locked; fields overridable in admin. */

export type MicrositeTheme = {
  fontHeading: string;
  fontBody: string;
  heroImageUrl: string | null;
  heroTitle: string;
  heroSubtitle: string;
  ctaLabel: string;
  bgHex: string;
  surfaceHex: string;
  textHex: string;
  mutedHex: string;
};

export const DEFAULT_MICROSITE_THEME: MicrositeTheme = {
  fontHeading: "Instrument Serif",
  fontBody: "DM Sans",
  heroImageUrl: null,
  heroTitle: "Book Your Appointment",
  heroSubtitle: "How to schedule your visit and find our salon.",
  ctaLabel: "Book Your Appointment",
  bgHex: "#0a0a0b",
  surfaceHex: "#141416",
  textHex: "#f4f4f5",
  mutedHex: "#a1a1aa",
};

function asTrimmedString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v.trim() : fallback;
}

function asHex(v: unknown, fallback: string): string {
  const s = asTrimmedString(v);
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : fallback;
}

/** Normalize unknown JSON → full theme with defaults. */
export function normalizeMicrositeTheme(raw: unknown): MicrositeTheme {
  const o =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const heroImageUrl = asTrimmedString(o.heroImageUrl);
  return {
    fontHeading:
      asTrimmedString(o.fontHeading) || DEFAULT_MICROSITE_THEME.fontHeading,
    fontBody: asTrimmedString(o.fontBody) || DEFAULT_MICROSITE_THEME.fontBody,
    heroImageUrl: heroImageUrl || null,
    heroTitle:
      asTrimmedString(o.heroTitle) || DEFAULT_MICROSITE_THEME.heroTitle,
    heroSubtitle:
      asTrimmedString(o.heroSubtitle) || DEFAULT_MICROSITE_THEME.heroSubtitle,
    ctaLabel: asTrimmedString(o.ctaLabel) || DEFAULT_MICROSITE_THEME.ctaLabel,
    bgHex: asHex(o.bgHex, DEFAULT_MICROSITE_THEME.bgHex),
    surfaceHex: asHex(o.surfaceHex, DEFAULT_MICROSITE_THEME.surfaceHex),
    textHex: asHex(o.textHex, DEFAULT_MICROSITE_THEME.textHex),
    mutedHex: asHex(o.mutedHex, DEFAULT_MICROSITE_THEME.mutedHex),
  };
}

/** Merge patch into existing theme (null clears nullable URL fields). */
export function mergeMicrositeTheme(
  current: unknown,
  patch: unknown,
): MicrositeTheme {
  const base = normalizeMicrositeTheme(current);
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return base;
  const p = patch as Record<string, unknown>;

  const next: MicrositeTheme = { ...base };
  if (typeof p.fontHeading === "string") {
    next.fontHeading = p.fontHeading.trim() || base.fontHeading;
  }
  if (typeof p.fontBody === "string") {
    next.fontBody = p.fontBody.trim() || base.fontBody;
  }
  if (p.heroImageUrl === null) next.heroImageUrl = null;
  else if (typeof p.heroImageUrl === "string") {
    next.heroImageUrl = p.heroImageUrl.trim() || null;
  }
  if (typeof p.heroTitle === "string") {
    next.heroTitle = p.heroTitle.trim() || base.heroTitle;
  }
  if (typeof p.heroSubtitle === "string") {
    next.heroSubtitle = p.heroSubtitle.trim() || base.heroSubtitle;
  }
  if (typeof p.ctaLabel === "string") {
    next.ctaLabel = p.ctaLabel.trim() || base.ctaLabel;
  }
  if (typeof p.bgHex === "string") next.bgHex = asHex(p.bgHex, base.bgHex);
  if (typeof p.surfaceHex === "string") {
    next.surfaceHex = asHex(p.surfaceHex, base.surfaceHex);
  }
  if (typeof p.textHex === "string") next.textHex = asHex(p.textHex, base.textHex);
  if (typeof p.mutedHex === "string") {
    next.mutedHex = asHex(p.mutedHex, base.mutedHex);
  }
  return next;
}
