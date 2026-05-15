import type { NextFunction, Request, Response } from "express";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PATCH, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, If-None-Match",
  "Access-Control-Expose-Headers": "ETag",
};

export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  for (const [k, v] of Object.entries(corsHeaders)) {
    res.setHeader(k, v);
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}
