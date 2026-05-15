import type { Request } from "express";

/** Base URL for absolute links to uploaded assets (e.g. from salonx-web-v2). */
export function requestOrigin(req: Request): string {
  const host = req.get("host");
  if (!host) return "http://localhost:4000";
  const xfProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = xfProto || req.protocol || "http";
  return `${proto}://${host}`;
}

/** Stable public URL when deployed. Falls back to request host. */
export function publicSiteOrigin(req: Request): string {
  const env =
    process.env.PUBLIC_SITE_URL?.trim()?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim()?.replace(/\/$/, "");
  if (env) return env;
  return requestOrigin(req);
}
