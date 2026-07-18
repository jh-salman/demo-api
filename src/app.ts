import express from "express";
import { toNodeHandler } from "better-auth/node";
import { corsMiddleware } from "./middleware/cors.middleware.js";
import { registerRoutes } from "./routes/index.js";
import { errorMiddleware } from "./middleware/error.middleware.js";
import { auth } from "./lib/auth.js";

export function createApp(): express.Express {
  const app = express();

  app.use(corsMiddleware);

  // Better Auth needs the raw body — mount before express.json().
  // Path-prefix middleware avoids Express 5 wildcard quirks.
  // Important: only `/api/auth` + `/api/auth/*` — NOT `/api/auth-app` (onboarding).
  const authHandler = toNodeHandler(auth);
  app.use((req, res, next) => {
    const p = req.path;
    const isBetterAuth = p === "/api/auth" || p.startsWith("/api/auth/");
    if (!isBetterAuth) {
      next();
      return;
    }
    return authHandler(req, res);
  });

  app.use(express.json({ limit: "4mb" }));
  registerRoutes(app);

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use(errorMiddleware);

  return app;
}
