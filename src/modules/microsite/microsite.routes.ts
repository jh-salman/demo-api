import { Router } from "express";
import { micrositeController } from "./microsite.controller.js";
import { waitlistController } from "../waitlist/waitlist.controller.js";
import { requireSession } from "../../middleware/auth.middleware.js";

export const micrositeRouter = Router();

/** Template list stays readable; create/patch require session + active org. */
micrositeRouter.get("/templates", micrositeController.listTemplates);
micrositeRouter.get("/salons", requireSession, micrositeController.listSalons);
micrositeRouter.get("/slug-available", micrositeController.checkSlug);
micrositeRouter.post("/create", requireSession, micrositeController.create);
micrositeRouter.patch(
  "/salons/:slug",
  requireSession,
  micrositeController.patchSalon,
);

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
micrositeRouter.post(
  "/public/salons/:slug/smart-availability",
  micrositeController.smartAvailability,
);
micrositeRouter.post(
  "/public/salons/:slug/waitlist",
  waitlistController.joinPublic,
);
micrositeRouter.post("/public/salons/:slug/book", micrositeController.book);
