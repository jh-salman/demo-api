import { Router } from "express";
import { attachTenant } from "../../middleware/auth.middleware.js";
import { appointmentsController } from "./appointments.controller.js";

export const appointmentsRouter = Router();

appointmentsRouter.use(attachTenant);
appointmentsRouter.get("/", appointmentsController.list);
appointmentsRouter.post("/", appointmentsController.create);
appointmentsRouter.get("/:id", appointmentsController.getById);
appointmentsRouter.patch("/:id", appointmentsController.patch);
appointmentsRouter.delete("/:id", appointmentsController.remove);
