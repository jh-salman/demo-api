import { Router } from "express";
import { rampController } from "./ramp.controller.js";

/** Grouped RAMP read routes (`GET /api/ramp/post/:token`). */
export const rampRouter = Router();

rampRouter.get("/recent", rampController.listRecent);
rampRouter.post("/submit-capture", rampController.submitRampCapture);
rampRouter.get("/status/:token", rampController.getStatus);
rampRouter.post("/:token/regenerate", rampController.regenerate);
rampRouter.post("/:token/recipient", rampController.updateRecipient);
rampRouter.post("/:token/send-sms", rampController.sendSms);
rampRouter.get("/post/:token", rampController.getPost);
rampRouter.post("/start-post", rampController.startStylistPost);
