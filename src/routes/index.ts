import type { Express } from "express";
import express from "express";
import path from "node:path";
import { healthRouter } from "../modules/health/health.routes.js";
import { appointmentsRouter } from "../modules/appointments/appointments.routes.js";
import { configRouter } from "../modules/config/config.routes.js";
import { uploadRouter } from "../modules/upload/upload.routes.js";
import { uploadSignRouter } from "../modules/upload-sign/upload-sign.routes.js";
import { calendarToolbarRouter } from "../modules/calendar-toolbar/calendar-toolbar.routes.js";
import { clientsRouter } from "../modules/clients/clients.routes.js";
import { serviceCatalogRouter } from "../modules/service-catalog/service-catalog.routes.js";

export function registerRoutes(app: Express) {
  app.use("/health", healthRouter);
  app.use(
    "/uploads",
    express.static(path.join(process.cwd(), "public", "uploads"), { fallthrough: true }),
  );
  app.use("/api/config", configRouter);
  app.use("/api/upload/sign", uploadSignRouter);
  app.use("/api/upload", uploadRouter);
  app.use("/api/calendar-toolbar", calendarToolbarRouter);
  app.use("/api/clients", clientsRouter);
  app.use("/api/service-catalog", serviceCatalogRouter);
  app.use("/api/appointments", appointmentsRouter);
}
