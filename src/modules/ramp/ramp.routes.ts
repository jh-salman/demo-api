import { Router } from "express";
import { rampController } from "./ramp.controller.js";

/** Grouped RAMP read routes (`GET /api/ramp/post/:token`). */
export const rampRouter = Router();

rampRouter.get("/recent", rampController.listRecent);
rampRouter.get("/library", rampController.listLibrary);
rampRouter.post("/submit-capture", rampController.submitRampCapture);
rampRouter.post("/:token/park-pick", rampController.parkPick);
rampRouter.get("/:token/candidates", rampController.listCandidates);
rampRouter.get("/status/:token", rampController.getStatus);
rampRouter.post("/:token/dismiss-queue", rampController.dismissFromQueue);
rampRouter.post("/:token/regenerate", rampController.regenerate);
rampRouter.post("/:token/recipient", rampController.updateRecipient);
rampRouter.post("/:token/send-sms", rampController.sendSms);
rampRouter.get("/post/:token", rampController.getPost);
rampRouter.post("/start-post", rampController.startStylistPost);
