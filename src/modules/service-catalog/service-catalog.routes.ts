import { Router } from "express";
import { serviceCatalogController } from "./service-catalog.controller.js";

export const serviceCatalogRouter = Router();

serviceCatalogRouter.get("/", serviceCatalogController.get);
serviceCatalogRouter.put("/", serviceCatalogController.put);
