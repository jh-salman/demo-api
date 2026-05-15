import type { Request, Response } from "express";
import { configJsonWithMeta } from "../../lib/config-response.js";
import { readConfigForLiveApp, readConfigWithMeta } from "../../lib/store.js";

const POLL_MS_WEB = 350;
const POLL_MS_ADMIN = 1200;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PATCH, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, If-None-Match",
  "Access-Control-Expose-Headers": "ETag",
};

/**
 * SSE: pushes config when watched revision changes (same behaviour as v2-admin `/api/config/stream`).
 */
export function configStreamHandler(req: Request, res: Response): void {
  const forWeb = req.query.forWeb === "1";
  const pollMs = forWeb ? POLL_MS_WEB : POLL_MS_ADMIN;
  let lastToken = "";

  for (const [k, v] of Object.entries(corsHeaders)) {
    res.setHeader(k, v);
  }
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const writeSse = (data: string) => {
    res.write(data);
  };

  writeSse(`retry: ${pollMs}\n\n`);

  let closed = false;
  req.on("close", () => {
    closed = true;
  });

  const tick = async () => {
    while (!closed) {
      try {
        if (forWeb) {
          const { config, webProjectionRevision } = await readConfigForLiveApp();
          if (webProjectionRevision !== lastToken) {
            lastToken = webProjectionRevision;
            const payload = JSON.stringify(
              configJsonWithMeta(config, req, webProjectionRevision),
            );
            writeSse(`data: ${payload}\n\n`);
          }
        } else {
          const { config, revision, webProjectionRevision } = await readConfigWithMeta();
          if (revision !== lastToken) {
            lastToken = revision;
            const payload = JSON.stringify(
              configJsonWithMeta(config, req, webProjectionRevision),
            );
            writeSse(`data: ${payload}\n\n`);
          }
        }
      } catch {
        /* ignore */
      }
      await new Promise<void>((resolve) => setTimeout(resolve, pollMs));
    }
    try {
      res.end();
    } catch {
      /* */
    }
  };

  void tick();
}
