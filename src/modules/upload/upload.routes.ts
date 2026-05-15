import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import os from "node:os";
import path from "node:path";
import { uploadController } from "./upload.controller.js";

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, os.tmpdir());
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "") || "";
    cb(null, `${randomUUID()}${ext}`);
  },
});

const uploadMw = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
});

export const uploadRouter = Router();

uploadRouter.post("/", uploadMw.single("file"), uploadController.post);
