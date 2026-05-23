import type { Request } from "express";
import { publicSiteOrigin } from "../../lib/public-url.js";
import { RAMP_DEMO_PROFILE } from "./ramp-demo-profile.js";
import { normalizeProducts } from "./ramp-memory.store.js";

function escXml(raw: string): string {
  return String(raw || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function firstName(full: string): string {
  const raw = String(full || "").trim();
  if (!raw) return "Guest";
  return raw.split(/\s+/)[0] || raw;
}

export type CareCardInput = {
  recipientName: string;
  stylistName: string;
  products: string[];
  eventLabel?: string;
  brandHandle?: string;
};

/** Premium continuity card — MMS visual; clickable link stays in SMS body (NUCLEAR 7). */
export function buildCareCardSvg(input: CareCardInput): string {
  const name = escXml(firstName(input.recipientName));
  const stylist = escXml(input.stylistName || RAMP_DEMO_PROFILE.stylistName);
  const event = escXml(input.eventLabel || RAMP_DEMO_PROFILE.eventLabel);
  const handle = escXml(input.brandHandle || RAMP_DEMO_PROFILE.primaryIgHandle);
  const products = normalizeProducts(input.products).slice(0, 4);

  const productLines = products.length
    ? products.map((p, i) => {
        const y = 520 + i * 28;
        return `<text x="48" y="${y}" fill="rgba(255,255,255,0.82)" font-family="system-ui,sans-serif" font-size="18" font-weight="600">${escXml(p)}</text>`;
      }).join("")
    : `<text x="48" y="520" fill="rgba(255,255,255,0.55)" font-family="system-ui,sans-serif" font-size="16" font-weight="500">Your finish care ritual</text>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#101010"/>
      <stop offset="100%" stop-color="#050505"/>
    </linearGradient>
  </defs>
  <rect width="600" height="900" fill="url(#bg)"/>
  <rect x="24" y="24" width="552" height="852" rx="28" fill="none" stroke="rgba(0,255,138,0.35)" stroke-width="2"/>
  <text x="48" y="88" fill="#00ff8a" font-family="system-ui,sans-serif" font-size="14" font-weight="800" letter-spacing="3">CLIENT CARE</text>
  <text x="48" y="168" fill="#ffffff" font-family="system-ui,sans-serif" font-size="42" font-weight="800">${name},</text>
  <text x="48" y="222" fill="rgba(255,255,255,0.88)" font-family="system-ui,sans-serif" font-size="24" font-weight="600">thank you for today.</text>
  <text x="48" y="300" fill="rgba(255,255,255,0.72)" font-family="system-ui,sans-serif" font-size="18" font-weight="500">With ${stylist}</text>
  <text x="48" y="334" fill="rgba(255,255,255,0.55)" font-family="system-ui,sans-serif" font-size="16" font-weight="500">${event}</text>
  <line x1="48" y1="380" x2="552" y2="380" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
  <text x="48" y="420" fill="#ff7a00" font-family="system-ui,sans-serif" font-size="13" font-weight="800" letter-spacing="2">FINISH CARE</text>
  ${productLines}
  <text x="48" y="720" fill="rgba(255,255,255,0.78)" font-family="system-ui,sans-serif" font-size="20" font-weight="700">Something special is waiting.</text>
  <text x="48" y="758" fill="rgba(255,255,255,0.55)" font-family="system-ui,sans-serif" font-size="16" font-weight="500">Open the link in your message.</text>
  <text x="48" y="828" fill="#00ff8a" font-family="system-ui,sans-serif" font-size="18" font-weight="700">${handle}</text>
</svg>`;
}

/** Absolute URL for MMS MediaUrl (demo-api hosted SVG). */
export function rampCareCardAssetUrl(req: Request | undefined, token: string): string {
  const base = publicSiteOrigin(req as Request).replace(/\/$/, "");
  return `${base}/api/ramp/care-card/${encodeURIComponent(token)}.svg`;
}
