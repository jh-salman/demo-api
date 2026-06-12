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
import { staffRouter } from "../modules/staff/staff.routes.js";
import { serviceCatalogRouter } from "../modules/service-catalog/service-catalog.routes.js";
import { clientConsultationRouter } from "../modules/client-consultation/client-consultation.routes.js";
import { appointmentVisitRouter } from "../modules/appointment-visit/appointment-visit.routes.js";
import { productCatalogRouter } from "../modules/product-catalog/product-catalog.routes.js";
import { rampController } from "../modules/ramp/ramp.controller.js";
import { rampRouter } from "../modules/ramp/ramp.routes.js";

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
  app.use("/api/staff", staffRouter);
  app.use("/api/service-catalog", serviceCatalogRouter);
  app.use("/api/product-catalog", productCatalogRouter);
  app.use("/api/client-consultation", clientConsultationRouter);
  app.use("/api/appointment-visit", appointmentVisitRouter);
  app.use("/api/appointments", appointmentsRouter);
  // SUPER RAMP 2 — POST IT runtime (NUCLEAR 7 contract paths)
  app.post("/api/fire-care-card", rampController.fireCareCard);
  app.post("/api/store-shared-selfie", rampController.storeSharedSelfie);
  app.post("/api/mms-in", rampController.mmsIn);
  app.post("/api/track-copy", rampController.trackCopy);
  app.use("/api/ramp", rampRouter);
}
