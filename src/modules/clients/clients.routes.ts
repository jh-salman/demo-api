import { Router } from "express";
import { requireActiveSalon } from "../../middleware/auth.middleware.js";
import { clientsController } from "./clients.controller.js";

export const clientsRouter = Router();

/** Clients are organization-owned — require active salon. */
clientsRouter.use(requireActiveSalon);
clientsRouter.get("/", clientsController.get);
clientsRouter.put("/", clientsController.put);
