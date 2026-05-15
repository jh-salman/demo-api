import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import {
  type ConfigApiPatch,
  applyConfigApiPatch,
  isSlotAdjust,
  normalizeBrand,
} from "../../lib/salonx-config.js";
import { configJsonWithMeta } from "../../lib/config-response.js";
import { readConfigForLiveApp, readConfigWithMeta, writeConfig } from "../../lib/store.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { HttpError } from "../../middleware/error.middleware.js";
import { emitConfigUpdated } from "../../realtime/io.js";

function configEtag(forWeb: boolean, syncToken: string): string {
  const h = createHash("sha1")
    .update(forWeb ? `w:${syncToken}` : `a:${syncToken}`)
    .digest("hex")
    .slice(0, 20);
  return `"sx-${h}"`;
}

async function broadcastConfigAfterWrite(req: Request, publishToApp: boolean) {
  const adminMeta = await readConfigWithMeta();
  const adminBody = configJsonWithMeta(adminMeta.config, req, adminMeta.webProjectionRevision);
  emitConfigUpdated({
    scope: "draft",
    revision: adminMeta.revision,
    webProjectionRevision: adminMeta.webProjectionRevision,
    data: adminBody,
  });
  if (publishToApp) {
    const live = await readConfigForLiveApp();
    const liveBody = configJsonWithMeta(live.config, req, live.webProjectionRevision);
    emitConfigUpdated({
      scope: "published",
      revision: live.revision,
      webProjectionRevision: live.webProjectionRevision,
      data: liveBody,
    });
  }
}

export const configController = {
  get: asyncHandler(async (req: Request, res: Response) => {
    const forWeb = req.query.forWeb === "1";

    if (forWeb) {
      const { config, webProjectionRevision } = await readConfigForLiveApp();
      const body = configJsonWithMeta(config, req, webProjectionRevision);
      const etag = configEtag(true, webProjectionRevision);
      const inm = req.get("if-none-match");
      if (inm && inm === etag) {
        res.status(304).setHeader("ETag", etag);
        res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
        res.end();
        return;
      }
      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.json(body);
      return;
    }

    const { config, webProjectionRevision } = await readConfigWithMeta();
    const body = configJsonWithMeta(config, req, webProjectionRevision);
    const etag = configEtag(false, webProjectionRevision);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("ETag", etag);
    res.json(body);
  }),

  patch: asyncHandler(async (req: Request, res: Response) => {
    let body: unknown;
    try {
      body = req.body;
    } catch {
      throw new HttpError(400, "Invalid JSON body");
    }
    if (!body || typeof body !== "object") {
      throw new HttpError(400, "Expected JSON object");
    }
    const b = body as Record<string, unknown>;
    const { config: current } = await readConfigWithMeta();

    if (typeof b.removeBrandId === "string" && b.removeBrandId) {
      if (current.brands.length <= 1) {
        throw new HttpError(400, "Cannot remove the last brand");
      }
    }

    const patch: ConfigApiPatch = {};

    if (typeof b.activeBrandId === "string") {
      patch.activeBrandId = b.activeBrandId;
    }

    if (typeof b.primaryHex === "string") {
      patch.primaryHex = b.primaryHex;
    }

    const s1 = b.s1Demo;
    if (s1 && typeof s1 === "object") {
      patch.s1Demo = {};
      const im = (s1 as { images?: unknown }).images;
      if (im && typeof im === "object") {
        patch.s1Demo.images = {};
        for (const key of Object.keys(im)) {
          const v = (im as Record<string, unknown>)[key];
          if (typeof v === "string") {
            (patch.s1Demo.images as Record<string, string>)[key] = v;
          }
        }
      }
      const ad = (s1 as { adjust?: unknown }).adjust;
      if (ad && typeof ad === "object") {
        patch.s1Demo.adjust = {};
        for (const key of Object.keys(ad)) {
          const a = (ad as Record<string, unknown>)[key];
          if (isSlotAdjust(a)) {
            (patch.s1Demo.adjust as Record<string, typeof a>)[key] = a;
          }
        }
      }
    }

    if (b.addBrand && typeof b.addBrand === "object") {
      const ab = b.addBrand as { name?: string };
      patch.addBrand = { name: typeof ab.name === "string" ? ab.name : undefined };
    }

    if (typeof b.removeBrandId === "string") {
      patch.removeBrandId = b.removeBrandId;
    }

    if (b.saveBrand && typeof b.saveBrand === "object") {
      const sb = b.saveBrand as Record<string, unknown>;
      const id = typeof sb.id === "string" ? sb.id : "";
      const name = typeof sb.name === "string" ? sb.name : "Brand";
      patch.saveBrand = normalizeBrand(sb, id || "unknown", name);
    }

    const next = applyConfigApiPatch(current, patch);
    const publishToApp = b.publishToApp === true;
    await writeConfig(next, { publishToApp });
    const { config: persisted, webProjectionRevision } = await readConfigWithMeta();
    await broadcastConfigAfterWrite(req, publishToApp);
    res.json(configJsonWithMeta(persisted, req, webProjectionRevision));
  }),
};
