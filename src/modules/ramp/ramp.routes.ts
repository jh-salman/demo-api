import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import os from "node:os";
import path from "node:path";
import { rampController } from "./ramp.controller.js";

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, os.tmpdir());
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "") || ".png";
    cb(null, `${randomUUID()}${ext}`);
  },
});

const uploadMw = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
});

export const rampRouter = Router();

/** Text-only, `imageUrl`, or multipart `image` + `prompt`. Returns PNG bytes. */
rampRouter.post(
  "/generate-image",
  uploadMw.single("image"),
  rampController.generateImage,
);
