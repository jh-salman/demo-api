import { Router } from "express";
import { configController } from "./config.controller.js";
import { configStreamHandler } from "./config-stream.handler.js";

export const configRouter = Router();

configRouter.get("/", configController.get);
configRouter.patch("/", configController.patch);
configRouter.get("/stream", configStreamHandler);
