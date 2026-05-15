import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { v2 as cloudinary } from "cloudinary";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { HttpError } from "../../middleware/error.middleware.js";

type ResourceType = "image" | "video";

export const uploadSignController = {
  post: asyncHandler(async (req: Request, res: Response) => {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
    const cloudKey = process.env.CLOUDINARY_API_KEY?.trim();
    const cloudSecret = process.env.CLOUDINARY_API_SECRET?.trim();
    if (!cloudName || !cloudKey || !cloudSecret) {
      throw new HttpError(503, "Cloudinary not configured");
    }

    let resourceType: ResourceType = "image";
    if (req.body && typeof req.body === "object") {
      const rt = (req.body as { resourceType?: unknown }).resourceType;
      if (rt === "video") resourceType = "video";
      else if (rt === "image") resourceType = "image";
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: cloudKey,
      api_secret: cloudSecret,
    });

    const id = randomUUID();
    const folder = "salonx/build-station";
    const publicId = `${resourceType === "video" ? "video" : "s1"}/${id}`;
    const timestamp = Math.round(Date.now() / 1000);

    const paramsToSign: Record<string, string | number> = {
      folder,
      public_id: publicId,
      timestamp,
      overwrite: "false",
    };

    const signature = cloudinary.utils.api_sign_request(paramsToSign, cloudSecret);

    res.json({
      cloudName,
      apiKey: cloudKey,
      timestamp,
      signature,
      folder,
      publicId,
      resourceType,
    });
  }),
};
