import { Router } from "express";
import { attachTenant } from "../../middleware/auth.middleware.js";
import { appointmentVisitController } from "./appointment-visit.controller.js";

export const appointmentVisitRouter = Router();

appointmentVisitRouter.use(attachTenant);

appointmentVisitRouter.get(
  "/:appointmentId",
  appointmentVisitController.get,
);
appointmentVisitRouter.put(
  "/:appointmentId",
  appointmentVisitController.put,
);
