import { Router } from "express";
import {
  attachTenant,
  requireSession,
  requireActiveSalon,
} from "../../middleware/auth.middleware.js";
import { waitlistController } from "./waitlist.controller.js";

export const waitlistRouter = Router();

waitlistRouter.get(
  "/",
  requireSession,
  requireActiveSalon,
  attachTenant,
  waitlistController.list,
);
waitlistRouter.patch(
  "/:id",
  requireSession,
  requireActiveSalon,
  attachTenant,
  waitlistController.patch,
);
