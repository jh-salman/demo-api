/**
 * SALON X — RAMP AI prompt presets (locked handoff).
 * Source: SALONX_RAMP_AI_PROMPT_SYSTEM_PACKAGE/RAMP_AI_PROMPT_PRESETS.txt
 */

export type RampCapturePath = "stylist_path" | "client_path";
export type RampPostStylePreset =
  | "curiosity"
  | "transformation"
  | "event"
  | "brand"
  | "client_reaction";
export type RampVisualDirection =
  | "raw"
  | "premium_editorial"
  | "street_poster"
  | "behind_the_chair"
  | "funny_viral";
export type RampImageEditModifier =
  | "hair_color_pop"
  | "add_glow"
  | "sharpen"
  | "darken_background"
  | "add_texture";
export type RampBrandLayer =
  | "active_brand"
  | "creator_only"
  | "salon_x_only"
  | "no_brand";

export type RampPromptConfig = {
  capturePath: RampCapturePath;
  postStyle: RampPostStylePreset;
  visualDirection: RampVisualDirection;
  imageEdit: RampImageEditModifier;
  brandLayer: RampBrandLayer;
  brandSlug: string;
  recipientName: string;
  stylistName: string;
};

const NEVER_GENERATE = [
  "Do NOT make it look corporate, templated, AI-generated, beauty-ad generic, CRM-generated, or stock photography.",
  "Never generate over-polished beauty ads or plastic skin.",
].join(" ");

const CORE_VISUAL_DNA =
  "Core visual DNA: black, gold, white, gritty editorial, creator culture, backstage energy, premium mobile aesthetic.";

const BASE_PRESETS: Record<RampPostStylePreset, string> = {
  curiosity: `Create a vertical social-media beauty poster using the uploaded image as the primary reference.
Preserve the subject's facial identity and hairstyle integrity.
The image should feel: social-native, emotionally magnetic, creator-authored, backstage beauty culture, slightly raw, premium but not over-polished.
Lighting should feel dramatic and real, not studio-perfect.
Emphasize: hair tone, texture, movement, confidence, transformation energy.
Use black, gold, white, and active Danger Jones accent colors.
Add subtle editorial contrast and cinematic depth.
The composition should feel like: "something important just happened."
Target emotion: "I need to know who did this."`,

  transformation: `Create a transformation-focused social-media poster using the uploaded salon image.
The image should feel: elevated, emotionally confident, beauty-culture driven, transformation-focused, stylist-authored.
Preserve facial identity.
Enhance: hair dimension, shine, movement, color separation, texture clarity.
Use dramatic contrast and premium editorial beauty lighting.
The visual should communicate: "You walked in one way. You left upgraded."
Keep the background dark and cinematic.
Use subtle active-brand styling from Danger Jones.`,

  event: `Create a live-event beauty culture poster using the uploaded image.
The image should feel: backstage, energetic, culturally relevant, creator-first, social-native, live from the show floor.
Use gritty editorial styling with high contrast and emotional motion energy.
Maintain realistic skin and hair texture.
The visual should feel connected to: Premiere Orlando, Behind The Chair culture, creator momentum, social buzz.`,

  brand: `Create a co-branded beauty culture social poster using the uploaded salon image.
The final image should naturally integrate: stylist identity, brand presence, transformation energy, creator culture.
The brand should feel: "embedded into the moment."
Use premium dark editorial styling with restrained color accents.`,

  client_reaction: `Create a confidence-driven beauty social poster using the uploaded image.
Focus on: expression, confidence, emotional glow, authenticity, post-service excitement.
The final result should feel like: "the exact moment someone realized they look incredible."`,
};

const VISUAL_DIRECTION: Record<RampVisualDirection, string> = {
  raw: "Visual direction — RAW / NOT TOO POLISHED: Keep the image socially authentic and slightly imperfect. Avoid over-retouching. Maintain realistic texture and emotional realism.",
  premium_editorial:
    "Visual direction — PREMIUM EDITORIAL: Add elevated editorial contrast, luxury beauty lighting, and cinematic framing while preserving authenticity.",
  street_poster:
    "Visual direction — STREET POSTER: Add gritty poster-style energy, bold contrast, layered texture, and urban beauty-culture visual attitude.",
  behind_the_chair:
    "Visual direction — BEHIND-THE-CHAIR: Keep the visual intimate, stylist-driven, and salon-authentic.",
  funny_viral:
    "Visual direction — FUNNY / VIRAL: Add playful social-media energy and exaggerated emotional contrast while preserving the hairstyle and identity.",
};

const IMAGE_EDIT: Record<RampImageEditModifier, string> = {
  hair_color_pop:
    "Image edit — HAIR COLOR POP: Enhance dimensional color separation, shine, and tonal richness in the hair.",
  add_glow:
    "Image edit — ADD GLOW: Add subtle cinematic glow and confidence-enhancing warmth around the subject.",
  sharpen:
    "Image edit — SHARPEN PHOTO: Increase texture clarity and sharpen important hair details while maintaining natural skin realism.",
  darken_background:
    "Image edit — DARKEN BACKGROUND: Darken and simplify the background to increase visual focus on the hair and face.",
  add_texture:
    "Image edit — ADD TEXTURE: Add subtle editorial texture and layered visual depth without overpowering the image.",
};

const BRAND_LAYER: Record<RampBrandLayer, string> = {
  active_brand:
    "Brand layer — ACTIVE BRAND LIVE: Integrate the active brand identity naturally into the moment (Danger Jones accent system).",
  creator_only:
    "Brand layer — CREATOR ONLY: Prioritize stylist/creator identity over corporate brand lockup.",
  salon_x_only:
    "Brand layer — SALON X ONLY: Subtle Salon X system presence only — no heavy co-brand lockup.",
  no_brand: "Brand layer — NO BRAND: No visible brand lockup or logo treatment.",
};

const CAPTURE_PATH: Record<RampCapturePath, string> = {
  stylist_path:
    "Capture path — STYLIST PATH: Stylist-authored salon capture. Preserve backstage chair energy and professional beauty culture.",
  client_path:
    "Capture path — CLIENT PATH: Client selfie / client-origin capture. Preserve authentic client reaction energy and social-native feel.",
};

/** Normalize legacy postStyle ids from early RAMP builds. */
export function normalizeRampPostStylePreset(raw?: string): RampPostStylePreset {
  const key = String(raw || "curiosity")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (key === "new_look" || key === "professional") return "transformation";
  if (key === "curiosity" || key === "transformation" || key === "event" || key === "brand") {
    return key;
  }
  if (key === "client_reaction" || key === "reaction") return "client_reaction";
  return "curiosity";
}

export function normalizeRampVisualDirection(raw?: string): RampVisualDirection {
  const key = String(raw || "raw")
    .trim()
    .toLowerCase()
    .replace(/[\s-/]+/g, "_");
  if (key in VISUAL_DIRECTION) return key as RampVisualDirection;
  return "raw";
}

export function normalizeRampImageEdit(raw?: string): RampImageEditModifier {
  const key = String(raw || "hair_color_pop")
    .trim()
    .toLowerCase()
    .replace(/[\s-/]+/g, "_");
  if (key in IMAGE_EDIT) return key as RampImageEditModifier;
  return "hair_color_pop";
}

export function normalizeRampBrandLayer(raw?: string): RampBrandLayer {
  const key = String(raw || "active_brand")
    .trim()
    .toLowerCase()
    .replace(/[\s-/]+/g, "_");
  if (key in BRAND_LAYER) return key as RampBrandLayer;
  return "active_brand";
}

export function normalizeRampCapturePath(raw?: string, captureType?: string): RampCapturePath {
  const key = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-/]+/g, "_");
  if (key === "client_path" || key === "client") return "client_path";
  if (key === "stylist_path" || key === "stylist") return "stylist_path";
  const cap = String(captureType || "").trim().toLowerCase();
  if (cap === "selfie" || cap === "client") return "client_path";
  return "stylist_path";
}

export function buildRampAiPrompt(input: RampPromptConfig): string {
  const brand = String(input.brandSlug || "salon").replace(/-/g, " ");
  const client = String(input.recipientName || "Guest").trim() || "Guest";
  const stylist = String(input.stylistName || "Stylist").trim() || "Stylist";

  return [
    CAPTURE_PATH[input.capturePath],
    BASE_PRESETS[input.postStyle],
    VISUAL_DIRECTION[input.visualDirection],
    IMAGE_EDIT[input.imageEdit],
    BRAND_LAYER[input.brandLayer],
    CORE_VISUAL_DNA,
    `Subject context: celebrate ${client}'s look by stylist ${stylist} for ${brand}.`,
    "Preserve likeness from the reference photo. Portrait orientation. Target feed 1080x1350 or story 1080x1920.",
    "Target emotion: the user should think \"I need to share this.\"",
    NEVER_GENERATE,
    "The AI should generate images that feel creator-authored, socially valuable, emotionally alive, and culturally relevant.",
  ].join("\n\n");
}
