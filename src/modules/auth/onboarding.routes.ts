import { Router } from "express";
import {
  getMe,
  getOrgInvitations,
  getOrgMembers,
  postAcceptInvite,
  postCreateOrganization,
  postDeleteInvitation,
  postOnboard,
  postRemoveMember,
  postSwitchOrganization,
} from "./onboarding.controller.js";

export const authAppRouter = Router();

authAppRouter.get("/me", getMe);
authAppRouter.get("/org-invitations", getOrgInvitations);
authAppRouter.get("/org-members", getOrgMembers);
authAppRouter.post("/onboard", postOnboard);
authAppRouter.post("/organizations", postCreateOrganization);
authAppRouter.post("/switch-organization", postSwitchOrganization);
authAppRouter.post("/accept-invite", postAcceptInvite);
authAppRouter.post("/remove-member", postRemoveMember);
authAppRouter.post("/delete-invitation", postDeleteInvitation);
