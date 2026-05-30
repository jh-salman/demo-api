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
  /** Optional freeform edit instruction supplied on a regenerate request. */
  extraNote?: string;
};

const NEVER_GENERATE = [
  "Do NOT make it look corporate, templated, AI-generated, beauty-ad generic, CRM-generated, or stock photography.",
  "Never generate over-polished beauty ads or plastic skin.",
  "Do NOT distort, swap, beautify, or age the subjects' faces — keep their exact likeness from the reference photo.",
  "Do NOT add extra people, extra fingers, or warped hands.",
  "Keep all rendered text clean, bold, and spelled correctly — no gibberish lettering.",
  "No external watermarks, no copyright marks, no stock-site logos.",
].join(" ");

const CORE_VISUAL_DNA =
  "Core visual DNA: black gritty textured background, electric neon accent (Danger Jones green by default; use the active brand's signature accent otherwise), white + neon hand-painted brush typography, raw creator-culture energy, backstage / show-floor buzz, premium social-native mobile aesthetic.";

/**
 * RAMP POST poster system — the exact design language to replicate:
 * grunge brush headline hook, framed/torn subject photo with a bold hair-color
 * pop, lightning-bolt + arrow accents, vertical brand wordmark, and a neon
 * "comment below" call-to-action banner. Vertical 9:16 social poster.
 */
const RAMP_POSTER_SYSTEM = [
  "OUTPUT FORMAT: a finished vertical 9:16 social-media POSTER (story format), not a plain photo. Treat the uploaded image as the hero photo placed inside a designed graphic layout.",
  "BACKGROUND: deep black with gritty grunge texture, faint distressed paper/scratches, subtle dark foliage or smoke shadows. High contrast.",
  "HERO PHOTO: place the uploaded subjects inside a slightly rotated photo frame with rough torn / taped edges (polaroid-meets-poster). Keep faces sharp and recognizable. Apply a bold, vivid HAIR-COLOR POP (electric neon green by default, or the active brand accent) onto the relevant subject's hair so the transformation reads instantly — keep it believable on the hair only.",
  "HEADLINE TYPOGRAPHY: large hand-painted grunge BRUSH lettering across the top, mixing bright white and the neon accent. Energetic, slightly messy, layered strokes. The headline is a curiosity HOOK question (see TEXT TO RENDER).",
  "GRAPHIC ELEMENTS: scatter neon lightning-bolt marks, hand-drawn arrows pointing at the photo, small '[LIVE]' tag, a 'RAMP POST IT' badge, and short kicker phrases like 'NEW LOOK / NEW ENERGY' and 'WHEN CULTURE SHOWS UP, EVERYTHING CHANGES.'",
  "BRAND SIDEBAR: the active brand wordmark set vertically down one edge in faded tonal type (e.g. 'DANGER JONES').",
  "CTA BANNER: a torn neon accent banner near the bottom reading the comment call-to-action, with a tiny footer line under it (see TEXT TO RENDER).",
].join("\n");

const BASE_PRESETS: Record<RampPostStylePreset, string> = {
  curiosity: `Create a vertical social-media CURIOSITY-HOOK poster using the uploaded image as the hero photo inside a designed graphic layout (RAMP POST style).
Preserve every subject's facial identity exactly; only the hair gets the bold color pop.
The poster should feel: social-native, gossip-worthy, creator-authored, backstage beauty culture, raw and loud, premium but not over-polished.
The big grunge brush headline asks a playful "did this just happen?" question that makes people stop scrolling.
Emphasize: the dramatic hair-color transformation, energy, and "wait, who did this?" intrigue.
Composition should feel like: "something just went down at the show floor."
Target emotion: "I need to know who did this — and comment."`,

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

/** KISS reference mode — selfie (image 1) + reference poster (image 2). */
export function buildRampReferencePosterPrompt(input: {
  recipientName: string;
  stylistName: string;
  extraNote?: string;
}): string {
  const client = String(input.recipientName || "Guest").trim() || "Guest";
  const stylist = String(input.stylistName || "Stylist").trim() || "Stylist";
  const note = String(input.extraNote || "").trim();
  const extraDirection = note
    ? `STYLIST NOTE (priority — still preserve faces and keep reference poster text legible): ${note}`
    : "";

  return [
    "You receive TWO images:",
    "• IMAGE 1 (first): live capture / selfie — preserve every face exactly; these are the subjects.",
    "• IMAGE 2 (second): REFERENCE POSTER — mirror this layout, typography, colors, branding, text, and scene exactly.",
    "TASK: Place the people from IMAGE 1 into the reference poster from IMAGE 2 as if photographed on that show floor. Keep all poster text, logos, handles, and graphic design from IMAGE 2 unchanged and sharp.",
    "Do NOT invent a new layout. Do NOT use generic beauty-ad or templated CRM styling. Match IMAGE 2 fidelity and finish quality.",
    ...(extraDirection ? [extraDirection] : []),
    `Subject context: ${client} with stylist ${stylist}.`,
    "Preserve every face's likeness from IMAGE 1. Vertical portrait poster, 1024x1536 (story 9:16).",
    NEVER_GENERATE,
    "Output a finished, post-ready RAMP poster ready to share on social.",
  ].join("\n\n");
}

export function buildRampAiPrompt(input: RampPromptConfig): string {
  const brand = String(input.brandSlug || "salon").replace(/-/g, " ");
  const client = String(input.recipientName || "Guest").trim() || "Guest";
  const stylist = String(input.stylistName || "Stylist").trim() || "Stylist";

  const brandWordmark = brand.toUpperCase();
  const headline = `Did ${client} get his hair done by ${stylist}?`;

  const note = String(input.extraNote || "").trim();
  const extraDirection = note
    ? `PRIORITY EDIT INSTRUCTION (from the stylist — apply this above all stylistic defaults, but still preserve every face's likeness and keep all text spelled correctly): ${note}`
    : "";

  const textToRender = [
    "TEXT TO RENDER (spell exactly, bold and legible):",
    `• HEADLINE (grunge brush, white + neon): "${headline}"`,
    `• KICKER near headline: "NEW LOOK / NEW ENERGY"`,
    `• TAGS: "[LIVE]"  and  "RAMP POST IT NOW"`,
    `• SIDE NOTE: "WHEN CULTURE SHOWS UP, EVERYTHING CHANGES."`,
    `• VERTICAL BRAND WORDMARK down one edge: "${brandWordmark}"`,
    `• CTA BANNER (neon, torn): "WHAT DO YOU THINK?  ⚡  COMMENT BELOW"`,
    `• FOOTER LINE under banner: "MORE ALL WEEKEND."`,
  ].join("\n");

  return [
    CAPTURE_PATH[input.capturePath],
    BASE_PRESETS[input.postStyle],
    RAMP_POSTER_SYSTEM,
    VISUAL_DIRECTION[input.visualDirection],
    IMAGE_EDIT[input.imageEdit],
    BRAND_LAYER[input.brandLayer],
    CORE_VISUAL_DNA,
    ...(extraDirection ? [extraDirection] : []),
    `Subject context: celebrate ${client}'s new look by stylist ${stylist} for ${brand}.`,
    textToRender,
    "Preserve every face's likeness from the reference photo. Vertical portrait poster, 1024x1536 (story 9:16).",
    "Target emotion: the user should think \"I need to share this and comment.\"",
    NEVER_GENERATE,
    "The AI should generate a finished, post-ready RAMP poster that feels creator-authored, socially valuable, emotionally alive, and culturally relevant.",
  ].join("\n\n");
}
