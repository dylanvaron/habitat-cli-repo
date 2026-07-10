import type { Hono } from "hono";

export function registerHealthRoutes(app: Hono): void {
  app.get("/health", (context) => {
    return context.json({
      ok: true,
      service: "habitat-backend",
    });
  });
}
