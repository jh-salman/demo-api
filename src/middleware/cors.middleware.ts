import type { NextFunction, Request, Response } from "express";

function allowedOrigins(): string[] | "*" {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (!raw || raw === "*") return "*";
  return raw
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function pickOrigin(req: Request): string {
  const allowed = allowedOrigins();
  const requestOrigin = req.headers.origin;
  // Credentials (auth cookies) cannot use `*`; echo request origin in open/dev mode.
  if (allowed === "*") return requestOrigin || "*";
  if (requestOrigin && allowed.includes(requestOrigin)) return requestOrigin;
  return allowed[0] ?? requestOrigin ?? "*";
}

export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  const origin = pickOrigin(req);
  const allowCredentials = Boolean(req.headers.origin) && origin !== "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  if (allowCredentials) {
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, PATCH, POST, PUT, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, If-None-Match, If-Match, Authorization, Cookie",
  );
  res.setHeader("Access-Control-Expose-Headers", "ETag");
  if (origin !== "*") {
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}
