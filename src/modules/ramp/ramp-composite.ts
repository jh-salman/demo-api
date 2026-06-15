import sharp from "sharp";
import { cutoutSubject } from "./ramp-bg-removal.js";

/** Story poster canvas (9:16). */
export const RAMP_POSTER_W = 1024;
export const RAMP_POSTER_H = 1536;

/**
 * Hero zone for the bundled reference poster — the area where the two people
 * appear in the sample (right-leaning, lower portion). The real subject cutout
 * is anchored to the bottom of this zone so the full face + body stay visible.
 */
export const DEFAULT_HERO_FRAME = {
  x: 280,
  y: 440,
  w: 712,
  h: 1040,
};

export type RampHeroFrame = {
  x: number;
  y: number;
  w: number;
  h: number;
};

/** Editable text layers rendered onto the deterministic poster. */
export type RampPosterText = {
  headline?: string;
  attribution?: string;
  tags?: string[];
  link?: string;
  accent?: string;
};

function escapeXml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Greedy word-wrap by estimated glyph width (bold sans ≈ 0.56·fontSize). */
function wrapText(text: string, fontSize: number, maxWidth: number, maxLines: number): string[] {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const maxChars = Math.max(6, Math.floor(maxWidth / (fontSize * 0.56)));
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length > maxLines) lines.length = maxLines;
  // Ellipsis if the text overflowed the allotted lines.
  const consumed = lines.join(" ").split(/\s+/).length;
  if (consumed < words.length && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1]}…`;
  }
  return lines;
}

function hasPosterText(text?: RampPosterText): boolean {
  if (!text) return false;
  return Boolean(
    String(text.headline || "").trim() ||
      String(text.attribution || "").trim() ||
      String(text.link || "").trim() ||
      (Array.isArray(text.tags) && text.tags.some((t) => String(t || "").trim())),
  );
}

/**
 * Build a full-canvas SVG that renders the editable text layers — headline hook
 * at the top, attribution + tags + referral link at the bottom — over legibility
 * scrims. Returns null when there is nothing to render.
 */
function buildTextOverlaySvg(text: RampPosterText): Buffer | null {
  const accent = String(text.accent || "").trim() || "#E9C46A";
  const sideMargin = 64;
  const maxTextWidth = RAMP_POSTER_W - sideMargin * 2;

  const headlineSize = 66;
  const headlineLines = wrapText(text.headline || "", headlineSize, maxTextWidth, 3);

  const attribution = String(text.attribution || "").trim();
  const tags = (Array.isArray(text.tags) ? text.tags : [])
    .map((t) => String(t || "").trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((t) => (t.startsWith("#") ? t : `#${t.replace(/^#+/, "")}`));
  const link = String(text.link || "").trim();

  const parts: string[] = [];

  parts.push(`
    <defs>
      <linearGradient id="topScrim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#000000" stop-opacity="0.62"/>
        <stop offset="1" stop-color="#000000" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="bottomScrim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#000000" stop-opacity="0"/>
        <stop offset="1" stop-color="#000000" stop-opacity="0.78"/>
      </linearGradient>
    </defs>
  `);

  if (headlineLines.length) {
    parts.push(
      `<rect x="0" y="0" width="${RAMP_POSTER_W}" height="380" fill="url(#topScrim)"/>`,
    );
    const lineHeight = Math.round(headlineSize * 1.12);
    const startY = 120;
    headlineLines.forEach((line, i) => {
      parts.push(
        `<text x="${sideMargin}" y="${startY + i * lineHeight}" font-family="'Helvetica Neue',Arial,sans-serif" font-size="${headlineSize}" font-weight="800" letter-spacing="-1" fill="#FFFFFF">${escapeXml(line.toUpperCase())}</text>`,
      );
    });
  }

  const hasBottom = Boolean(attribution || tags.length || link);
  if (hasBottom) {
    parts.push(
      `<rect x="0" y="${RAMP_POSTER_H - 400}" width="${RAMP_POSTER_W}" height="400" fill="url(#bottomScrim)"/>`,
    );
    let cursorY = RAMP_POSTER_H - 64;
    if (link) {
      parts.push(
        `<text x="${sideMargin}" y="${cursorY}" font-family="'Helvetica Neue',Arial,sans-serif" font-size="30" font-weight="500" fill="#FFFFFF" fill-opacity="0.72">${escapeXml(link)}</text>`,
      );
      cursorY -= 46;
    }
    if (tags.length) {
      const tagLine = wrapText(tags.join("  "), 30, maxTextWidth, 1)[0] || tags.join("  ");
      parts.push(
        `<text x="${sideMargin}" y="${cursorY}" font-family="'Helvetica Neue',Arial,sans-serif" font-size="30" font-weight="600" fill="#FFFFFF" fill-opacity="0.88">${escapeXml(tagLine)}</text>`,
      );
      cursorY -= 52;
    }
    if (attribution) {
      const attrLine = wrapText(attribution, 42, maxTextWidth, 1)[0] || attribution;
      parts.push(
        `<text x="${sideMargin}" y="${cursorY}" font-family="'Helvetica Neue',Arial,sans-serif" font-size="42" font-weight="800" letter-spacing="-0.5" fill="${escapeXml(accent)}">${escapeXml(attrLine)}</text>`,
      );
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${RAMP_POSTER_W}" height="${RAMP_POSTER_H}" viewBox="0 0 ${RAMP_POSTER_W} ${RAMP_POSTER_H}">${parts.join("")}</svg>`;
  return Buffer.from(svg);
}

async function fetchImageBuffer(url: string): Promise<Buffer> {
  const trimmed = url.trim();
  const res = await fetch(trimmed);
  if (!res.ok) throw new Error(`Could not download image (${res.status})`);
  const ab = await res.arrayBuffer();
  const buffer = Buffer.from(ab);
  if (buffer.length < 32) throw new Error("Image download was empty or corrupt");
  return buffer;
}

/**
 * Prepare the subject layer: remove its background (real pixels preserved), trim
 * transparent padding, then scale to FIT INSIDE the hero zone — never cropping
 * the face or body — and anchor it to the bottom-centre of the zone.
 *
 * Falls back to a non-cutout cover-crop only if background removal fails, so the
 * composite never breaks.
 */
const SHADOW_PAD = 28;
const SHADOW_OFFSET_X = 10;
const SHADOW_OFFSET_Y = 18;

async function buildSubjectLayer(
  selfieBuf: Buffer,
  frame: RampHeroFrame,
): Promise<{ buffer: Buffer; left: number; top: number }> {
  const maxW = Math.round(frame.w * 0.96);
  const maxH = Math.round(frame.h * 0.98);

  try {
    const cutout = await cutoutSubject(selfieBuf);

    const trimmed = await sharp(cutout)
      .trim({ threshold: 10 })
      .toBuffer()
      .catch(() => cutout);

    const resized = await sharp(trimmed)
      .resize(maxW, maxH, { fit: "inside", withoutEnlargement: false })
      .ensureAlpha()
      .png()
      .toBuffer();

    const meta = await sharp(resized).metadata();
    const subjW = meta.width ?? maxW;
    const subjH = meta.height ?? maxH;

    // Soft drop shadow — blurred, dimmed silhouette of the subject's alpha so
    // the real cut-in reads as a designed poster rather than a flat sticker.
    const shadowAlpha = await sharp(resized)
      .extractChannel("alpha")
      .blur(16)
      .linear(0.5, 0)
      .png()
      .toBuffer();

    const shadow = await sharp({
      create: {
        width: subjW,
        height: subjH,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .joinChannel(shadowAlpha)
      .png()
      .toBuffer();

    const canvasW = subjW + SHADOW_PAD * 2;
    const canvasH = subjH + SHADOW_PAD * 2;

    const layer = await sharp({
      create: {
        width: canvasW,
        height: canvasH,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        { input: shadow, left: SHADOW_PAD + SHADOW_OFFSET_X, top: SHADOW_PAD + SHADOW_OFFSET_Y },
        { input: resized, left: SHADOW_PAD, top: SHADOW_PAD },
      ])
      .png()
      .toBuffer();

    const subjLeft = frame.x + Math.round((frame.w - subjW) / 2);
    const subjTop = frame.y + (frame.h - subjH);

    return {
      buffer: layer,
      left: subjLeft - SHADOW_PAD,
      top: subjTop - SHADOW_PAD,
    };
  } catch (e) {
    // Fallback — no cutout available: cover-fit the raw photo into the zone.
    // Surface WHY the cutout failed so we don't silently degrade to the raw photo.
    console.warn(
      "[ramp:composite] subject cutout failed — using raw cover-fit fallback:",
      e instanceof Error ? e.message : e,
    );
    const cover = await sharp(selfieBuf)
      .resize(frame.w, frame.h, { fit: "cover", position: "attention" })
      .png()
      .toBuffer();
    return { buffer: cover, left: frame.x, top: frame.y };
  }
}

/**
 * Clip a positioned layer to the poster canvas so sharp never receives an
 * out-of-bounds composite (negative offset or overflow on the right/bottom).
 */
async function clipToCanvas(
  layerBuf: Buffer,
  left: number,
  top: number,
): Promise<{ buffer: Buffer; left: number; top: number } | null> {
  const meta = await sharp(layerBuf).metadata();
  let lw = meta.width ?? 0;
  let lh = meta.height ?? 0;
  let sx = 0;
  let sy = 0;
  let dl = left;
  let dt = top;

  if (dl < 0) { sx = -dl; lw += dl; dl = 0; }
  if (dt < 0) { sy = -dt; lh += dt; dt = 0; }
  if (dl + lw > RAMP_POSTER_W) lw = RAMP_POSTER_W - dl;
  if (dt + lh > RAMP_POSTER_H) lh = RAMP_POSTER_H - dt;
  if (lw <= 0 || lh <= 0) return null;

  const cropped = await sharp(layerBuf)
    .extract({ left: sx, top: sy, width: lw, height: lh })
    .toBuffer();
  return { buffer: cropped, left: dl, top: dt };
}

/**
 * Deterministic RAMP composite — REAL subject pixels (face + body 100% match)
 * cut out of their own background and placed on a fixed poster background.
 * No AI redraw of the person; only the background/text is the designed layer.
 */
export async function compositeRampPoster(input: {
  backgroundUrl: string;
  selfieUrl: string;
  frame?: RampHeroFrame;
  text?: RampPosterText;
}): Promise<Buffer> {
  const backgroundUrl = String(input.backgroundUrl || "").trim();
  const selfieUrl = String(input.selfieUrl || "").trim();
  if (!backgroundUrl || !selfieUrl) {
    throw new Error("backgroundUrl and selfieUrl are required");
  }

  const frame = input.frame ?? DEFAULT_HERO_FRAME;

  const [bgBuf, selfieBuf] = await Promise.all([
    fetchImageBuffer(backgroundUrl),
    fetchImageBuffer(selfieUrl),
  ]);

  const background = await sharp(bgBuf)
    .resize(RAMP_POSTER_W, RAMP_POSTER_H, { fit: "cover", position: "centre" })
    .toBuffer();

  const subject = await buildSubjectLayer(selfieBuf, frame);
  const placed = await clipToCanvas(subject.buffer, subject.left, subject.top);

  const overlay = placed ?? { buffer: subject.buffer, left: frame.x, top: frame.y };

  const layers: sharp.OverlayOptions[] = [
    { input: overlay.buffer, left: overlay.left, top: overlay.top },
  ];

  // Editable text layers (caption hook, attribution, tags, referral link) are
  // painted ON TOP of the subject so they stay legible over the poster.
  if (hasPosterText(input.text)) {
    const textSvg = buildTextOverlaySvg(input.text!);
    if (textSvg) layers.push({ input: textSvg, left: 0, top: 0 });
  }

  return sharp(background)
    .composite(layers)
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}
