import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const healthController = {
  get: asyncHandler((_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  }),
};
