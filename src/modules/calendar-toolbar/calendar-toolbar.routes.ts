import { Router } from "express";
import { attachTenant } from "../../middleware/auth.middleware.js";
import { calendarToolbarController } from "./calendar-toolbar.controller.js";

export const calendarToolbarRouter = Router();

calendarToolbarRouter.use(attachTenant);
calendarToolbarRouter.get("/", calendarToolbarController.get);
calendarToolbarRouter.put("/", calendarToolbarController.put);
