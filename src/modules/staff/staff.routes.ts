import { Router } from "express";
import { attachTenant } from "../../middleware/auth.middleware.js";
import { staffController } from "./staff.controller.js";

export const staffRouter = Router();

staffRouter.use(attachTenant);
staffRouter.get("/", staffController.get);
staffRouter.put("/", staffController.put);
