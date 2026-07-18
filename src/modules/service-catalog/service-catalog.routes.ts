import { Router } from "express";
import { attachTenant } from "../../middleware/auth.middleware.js";
import { serviceCatalogController } from "./service-catalog.controller.js";

export const serviceCatalogRouter = Router();

serviceCatalogRouter.use(attachTenant);
serviceCatalogRouter.get("/", serviceCatalogController.get);
serviceCatalogRouter.put("/", serviceCatalogController.put);
