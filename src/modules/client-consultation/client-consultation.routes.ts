import { Router } from "express";
import { clientConsultationController } from "./client-consultation.controller.js";

export const clientConsultationRouter = Router();

clientConsultationRouter.get(
  "/:clientKey",
  clientConsultationController.get,
);
clientConsultationRouter.put(
  "/:clientKey",
  clientConsultationController.put,
);
