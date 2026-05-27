/** Demo-safe defaults when brand.ramp config is not wired yet. */
export const RAMP_DEMO_PROFILE = {
  brandSlug: "danger-jones",
  stylistName: "Joe Stylzz",
  primaryIgHandle: "@dangerjones_balayage",
  eventLabel: "Premier Orlando 2026",
  campaignHashtags: ["#ButterflyLoft", "#Balayage"],
  careCardHeroUrl: null as string | null,
} as const;

const POST_STYLE_HEADLINE: Record<string, string> = {
  curiosity: "Curiosity look",
  transformation: "Transformation",
  event: RAMP_DEMO_PROFILE.eventLabel,
  brand: "Brand spotlight",
  client_reaction: "Client reaction",
  new_look: "Transformation",
  professional: "Professional finish",
};

export function buildDemoCaption(input: {
  recipientName: string;
  stylistName: string;
  products: string[];
  postStyle?: string;
  tags?: string[];
  links?: string[];
}): string {
  const first = (input.recipientName || "Guest").trim().split(/\s+/)[0] || "Guest";
  const stylist = input.stylistName || RAMP_DEMO_PROFILE.stylistName;
  const styleKey = String(input.postStyle || "new_look").trim().toLowerCase();
  const headline = POST_STYLE_HEADLINE[styleKey] || POST_STYLE_HEADLINE.new_look;
  const tagList = (input.tags?.length ? input.tags : RAMP_DEMO_PROFILE.campaignHashtags)
    .map((t) => String(t || "").trim())
    .filter(Boolean)
    .slice(0, 8);
  const tags = tagList.join(" ");
  const productLine =
    input.products.length > 0 ? `\n${input.products.slice(0, 3).join(" · ")}` : "";
  const linkLine =
    input.links?.map((l) => String(l || "").trim()).filter(Boolean).slice(0, 2).join("\n") || "";
  const linkSuffix = linkLine ? `\n${linkLine}` : "";
  return `${headline} ✨\n${first} × ${stylist}${productLine}\n${RAMP_DEMO_PROFILE.primaryIgHandle}\n${tags}${linkSuffix}`;
}
