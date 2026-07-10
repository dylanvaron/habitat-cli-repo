import type { Hono } from "hono";
import { logHabitatApiResponse } from "../../logging";
import {
  deleteHabitatRequest,
  getBaseUrl,
  getHabitatRegistrationRequest,
  registerHabitatRequest,
} from "../../kepler";
import {
  deleteAllLocalState,
  hydrateModulesFromStarterModules,
  indexBlueprints,
  loadBuilds,
  loadModules,
  loadRegistration,
  saveBlueprints,
  saveModules,
  saveRegistration,
  type LocalRegistration,
} from "../../state";

type CreateRegistrationRequest = {
  displayName?: unknown;
};

export function registerRegistrationRoutes(app: Hono): void {
  app.get("/registration", async (context) => {
    const registration = loadRegistration();

    if (!registration) {
      logHabitatApiResponse("GET", "/registration", "not registered");
      return context.json({
        registration: null,
        localModulesCount: 0,
        queuedBuildsCount: 0,
      });
    }

    const response = await getHabitatRegistrationRequest(
      registration.habitatId,
      registration.baseUrl,
    );

    logHabitatApiResponse("GET", "/registration", registration.displayName);
    return context.json({
      registration,
      localModulesCount: Object.keys(loadModules()).length,
      queuedBuildsCount: Object.keys(loadBuilds()).length,
      remoteHabitat: response.habitat,
    });
  });

  app.post("/registration", async (context) => {
    const existingRegistration = loadRegistration();

    if (existingRegistration) {
      logHabitatApiResponse(
        "POST",
        "/registration",
        `already registered as ${existingRegistration.displayName}`,
      );
      return context.json(
        {
          error: `This CLI is already registered as "${existingRegistration.displayName}" (${existingRegistration.habitatId}). Run \`habitat status\` to inspect it or \`habitat unregister\` first.`,
        },
        409,
      );
    }

    const body = (await context.req.json()) as CreateRegistrationRequest;
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";

    if (!displayName) {
      logHabitatApiResponse("POST", "/registration", "Habitat display name is required.");
      return context.json({ error: "Habitat display name is required." }, 400);
    }

    const habitatUuid = crypto.randomUUID();
    const response = await registerHabitatRequest(displayName, habitatUuid);
    const blueprints = indexBlueprints(response.blueprints);
    const modules = hydrateModulesFromStarterModules(response.starterModules, blueprints);
    const registration: LocalRegistration = {
      habitatId: response.habitatId,
      habitatUuid,
      displayName,
      baseUrl: getBaseUrl(),
      registeredAt: new Date().toISOString(),
    };

    saveRegistration(registration);
    saveBlueprints(blueprints);
    saveModules(modules);

    logHabitatApiResponse("POST", "/registration", `registered ${displayName}`);
    return context.json({
      registration,
      hydratedModulesCount: Object.keys(modules).length,
    });
  });

  app.delete("/registration", async (context) => {
    const registration = loadRegistration();

    if (!registration) {
      logHabitatApiResponse("DELETE", "/registration", "not registered");
      return context.json({ error: "This CLI is not registered with Kepler." }, 404);
    }

    await deleteHabitatRequest(registration.habitatId, registration.baseUrl);
    deleteAllLocalState();

    logHabitatApiResponse(
      "DELETE",
      "/registration",
      `unregistered ${registration.displayName}`,
    );
    return context.json({
      displayName: registration.displayName,
    });
  });
}
