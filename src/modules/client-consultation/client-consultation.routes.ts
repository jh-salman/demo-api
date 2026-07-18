import { Router } from "express";
import { requireActiveSalon } from "../../middleware/auth.middleware.js";
import { clientConsultationController } from "./client-consultation.controller.js";

export const clientConsultationRouter = Router();

clientConsultationRouter.use(requireActiveSalon);
clientConsultationRouter.get(
  "/:clientKey",
  clientConsultationController.get,
);
clientConsultationRouter.put(
  "/:clientKey",
  clientConsultationController.put,
);
