import { Hono } from "hono";
import { logHabitatApiResponse } from "../logging";
import { registerHealthRoutes } from "./routes/health";
import { registerKeplerRoutes } from "./routes/kepler";
import { registerRegistrationRoutes } from "./routes/registration";
import { registerStateRoutes } from "./routes/state";
import { registerStaticUiRoutes } from "./static";

function getErrorResponse(error: unknown): { status: number; message: string } {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("Unable to connect")) {
    return {
      status: 502,
      message:
        "Unable to reach Kepler. Check your network connection and KEPLER_BASE_URL.",
    };
  }

  if (message.startsWith("Kepler request failed")) {
    return {
      status: 502,
      message,
    };
  }

  if (message.startsWith("Missing Kepler bearer token")) {
    return {
      status: 500,
      message,
    };
  }

  return {
    status: 500,
    message,
  };
}

export function createServerApp(): Hono {
  const app = new Hono();

  app.onError((error, context) => {
    const response = getErrorResponse(error);
    logHabitatApiResponse(context.req.method, context.req.path, response.message);
    return context.json({ error: response.message }, response.status);
  });

  registerHealthRoutes(app);
  registerKeplerRoutes(app);
  registerRegistrationRoutes(app);
  registerStateRoutes(app);
  registerStaticUiRoutes(app);

  return app;
}
