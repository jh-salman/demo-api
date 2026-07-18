import { Router } from "express";
import { attachTenant } from "../../middleware/auth.middleware.js";
import { productCatalogController } from "./product-catalog.controller.js";

export const productCatalogRouter = Router();

productCatalogRouter.use(attachTenant);
productCatalogRouter.get("/", productCatalogController.get);
productCatalogRouter.put("/", productCatalogController.put);
