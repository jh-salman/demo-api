import { Router } from "express";
import { appointmentVisitController } from "./appointment-visit.controller.js";

export const appointmentVisitRouter = Router();

appointmentVisitRouter.get(
  "/:appointmentId",
  appointmentVisitController.get,
);
appointmentVisitRouter.put(
  "/:appointmentId",
  appointmentVisitController.put,
);
