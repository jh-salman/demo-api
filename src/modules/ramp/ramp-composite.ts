import sharp from "sharp";

/** Story poster canvas (9:16). */
export const RAMP_POSTER_W = 1024;
export const RAMP_POSTER_H = 1536;

/** Default hero frame — empty torn-frame region on the background poster. */
export const DEFAULT_HERO_FRAME = {
  x: 232,
  y: 320,
  w: 560,
  h: 680,
};

export type RampHeroFrame = {
  x: number;
  y: number;
  w: number;
  h: number;
};

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
 * Deterministic RAMP composite — real selfie pixels overlaid on a fixed poster
 * background. No AI redraw; face likeness is preserved.
 */
export async function compositeRampPoster(input: {
  backgroundUrl: string;
  selfieUrl: string;
  frame?: RampHeroFrame;
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

  const selfie = await sharp(selfieBuf)
    .resize(frame.w, frame.h, { fit: "cover", position: "attention" })
    .toBuffer();

  return sharp(background)
    .composite([{ input: selfie, left: frame.x, top: frame.y }])
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}
