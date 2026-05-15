import { Router } from "express";
import { calendarToolbarController } from "./calendar-toolbar.controller.js";

export const calendarToolbarRouter = Router();

calendarToolbarRouter.get("/", calendarToolbarController.get);
calendarToolbarRouter.put("/", calendarToolbarController.put);
