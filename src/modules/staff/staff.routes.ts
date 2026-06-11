import { Router } from "express";
import { staffController } from "./staff.controller.js";

export const staffRouter = Router();

staffRouter.get("/", staffController.get);
staffRouter.put("/", staffController.put);
