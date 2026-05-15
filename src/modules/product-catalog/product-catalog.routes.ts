import { Router } from "express";
import { productCatalogController } from "./product-catalog.controller.js";

export const productCatalogRouter = Router();

productCatalogRouter.get("/", productCatalogController.get);
productCatalogRouter.put("/", productCatalogController.put);
