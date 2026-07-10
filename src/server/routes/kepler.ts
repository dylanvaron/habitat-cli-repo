import type { Hono } from "hono";
import { logHabitatApiResponse } from "../../logging";
import {
  getOfficialBlueprint,
  getWorldSolarIrradiance,
  listOfficialBlueprints,
  listOfficialResources,
} from "../../kepler";

export function registerKeplerRoutes(app: Hono): void {
  app.get("/catalog/blueprints", async (context) => {
    const version = context.req.query("version");
    const response = await listOfficialBlueprints(version);
    logHabitatApiResponse("GET", "/catalog/blueprints", "proxied to Kepler");
    return context.json(response);
  });

  app.get("/catalog/blueprints/:blueprintId", async (context) => {
    const blueprintId = context.req.param("blueprintId");
    const version = context.req.query("version");
    const response = await getOfficialBlueprint(blueprintId, version);
    logHabitatApiResponse(
      "GET",
      `/catalog/blueprints/${blueprintId}`,
      "proxied to Kepler",
    );
    return context.json(response);
  });

  app.get("/catalog/resources", async (context) => {
    const version = context.req.query("version");
    const response = await listOfficialResources(version);
    logHabitatApiResponse("GET", "/catalog/resources", "proxied to Kepler");
    return context.json(response);
  });

  app.get("/solar", async (context) => {
    const response = await getWorldSolarIrradiance();
    logHabitatApiResponse("GET", "/solar", "proxied to Kepler");
    return context.json(response);
  });
}
