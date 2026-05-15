import { Router } from "express";
import { uploadSignController } from "./upload-sign.controller.js";

export const uploadSignRouter = Router();

uploadSignRouter.post("/", uploadSignController.post);
