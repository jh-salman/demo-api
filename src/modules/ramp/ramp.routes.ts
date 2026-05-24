import { Router } from "express";
import { rampController } from "./ramp.controller.js";

/** Grouped RAMP read routes (`GET /api/ramp/post/:token`). */
export const rampRouter = Router();

rampRouter.get("/recent", rampController.listRecent);
rampRouter.get("/post/:token", rampController.getPost);
rampRouter.get("/care-card/:token", rampController.careCardSvg);
