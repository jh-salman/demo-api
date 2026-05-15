import { Router } from "express";
import { appointmentsController } from "./appointments.controller.js";

export const appointmentsRouter = Router();

appointmentsRouter.get("/", appointmentsController.list);
appointmentsRouter.post("/", appointmentsController.create);
appointmentsRouter.get("/:id", appointmentsController.getById);
appointmentsRouter.patch("/:id", appointmentsController.patch);
appointmentsRouter.delete("/:id", appointmentsController.remove);
