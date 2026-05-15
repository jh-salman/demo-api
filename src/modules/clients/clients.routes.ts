import { Router } from "express";
import { clientsController } from "./clients.controller.js";

export const clientsRouter = Router();

clientsRouter.get("/", clientsController.get);
clientsRouter.put("/", clientsController.put);
