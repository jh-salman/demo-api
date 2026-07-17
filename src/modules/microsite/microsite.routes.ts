import { Router } from "express";
import { micrositeController } from "./microsite.controller.js";

export const micrositeRouter = Router();

/** Template + create (stylist/admin surface — open for MVP like other demo-api routes). */
micrositeRouter.get("/templates", micrositeController.listTemplates);
micrositeRouter.get("/salons", micrositeController.listSalons);
micrositeRouter.get("/slug-available", micrositeController.checkSlug);
micrositeRouter.post("/create", micrositeController.create);
micrositeRouter.patch("/salons/:slug", micrositeController.patchSalon);

/** Public booking surface — resolved by slug. */
micrositeRouter.get("/public/salons/:slug", micrositeController.getPublicSalon);
micrositeRouter.get(
  "/public/salons/:slug/services",
  micrositeController.getPublicServices,
);
micrositeRouter.get(
  "/public/salons/:slug/staff",
  micrositeController.getPublicStaff,
);
micrositeRouter.get(
  "/public/salons/:slug/availability",
  micrositeController.getAvailability,
);
micrositeRouter.post("/public/salons/:slug/book", micrositeController.book);
