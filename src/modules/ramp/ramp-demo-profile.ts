/** Demo-safe defaults when brand.ramp config is not wired yet. */
export const RAMP_DEMO_PROFILE = {
  brandSlug: "danger-jones",
  stylistName: "Joe Stylzz",
  primaryIgHandle: "@dangerjones_balayage",
  eventLabel: "Premier Orlando 2026",
  campaignHashtags: ["#ButterflyLoft", "#Balayage"],
  careCardHeroUrl: null as string | null,
} as const;

export function buildDemoCaption(input: {
  recipientName: string;
  stylistName: string;
  products: string[];
}): string {
  const first = (input.recipientName || "Guest").trim().split(/\s+/)[0] || "Guest";
  const stylist = input.stylistName || RAMP_DEMO_PROFILE.stylistName;
  const tags = RAMP_DEMO_PROFILE.campaignHashtags.join(" ");
  const productLine =
    input.products.length > 0 ? `\n${input.products.slice(0, 3).join(" · ")}` : "";
  return `${RAMP_DEMO_PROFILE.eventLabel} ✨\n${first} × ${stylist}${productLine}\n${RAMP_DEMO_PROFILE.primaryIgHandle}\n${tags}`;
}

export function buildCareCardSms(input: {
  recipientName: string;
  stylistName: string;
  landingUrl: string;
}): string {
  const first = (input.recipientName || "there").trim().split(/\s+/)[0] || "there";
  const stylist = input.stylistName || RAMP_DEMO_PROFILE.stylistName;
  return `${first}, thank you for trusting ${stylist} with your look today.

We made something special for you:
${input.landingUrl}`;
}
