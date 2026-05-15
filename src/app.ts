import express from "express";
import { corsMiddleware } from "./middleware/cors.middleware.js";
import { registerRoutes } from "./routes/index.js";
import { errorMiddleware } from "./middleware/error.middleware.js";

export function createApp(): express.Express {
  const app = express();

  app.use(corsMiddleware);
  app.use(express.json({ limit: "4mb" }));
  registerRoutes(app);

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use(errorMiddleware);

  return app;
}
