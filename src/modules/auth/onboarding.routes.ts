import { Router } from "express";
import {
  getMe,
  postCreateOrganization,
  postOnboard,
  postSwitchOrganization,
} from "./onboarding.controller.js";

export const authAppRouter = Router();

authAppRouter.get("/me", getMe);
authAppRouter.post("/onboard", postOnboard);
authAppRouter.post("/organizations", postCreateOrganization);
authAppRouter.post("/switch-organization", postSwitchOrganization);
