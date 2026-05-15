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
  if (allowed === "*") return "*";
  if (requestOrigin && allowed.includes(requestOrigin)) return requestOrigin;
  return allowed[0] ?? "*";
}

export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  const origin = pickOrigin(req);
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, PATCH, POST, PUT, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, If-None-Match, If-Match",
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
