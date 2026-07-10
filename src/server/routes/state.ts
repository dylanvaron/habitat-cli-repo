import type { Hono } from "hono";
import { logHabitatApiResponse } from "../../logging";
import {
  addResourceToInventory,
  advanceBuildQueue,
  assignBuildFacility,
  cancelBuildsForForcedOfflineModules,
  cancelLocalBuild,
  createLocalModule,
  createLocalBuild,
  disconnectDeletedModule,
  getModulePowerDrawKw,
  isModuleRuntimeStatus,
  loadBlueprints,
  loadBuilds,
  loadModules,
  loadRegistration,
  loadResourceInventory,
  runPowerTicks,
  saveBuilds,
  saveModules,
  saveResourceInventory,
  spendResourceInventory,
  setModuleRuntimeStatus,
  synchronizeWorkshopAssignments,
  validateBlueprintCanBuildAsModule,
  validateBuildFacilityAvailability,
  validateBuildFacilityRequirement,
  validateSupplyCacheOnline,
} from "../../state";
import { getWorldSolarIrradiance } from "../../kepler";

export function registerStateRoutes(app: Hono): void {
  app.get("/modules", (context) => {
    const modules = Object.values(loadModules()).sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    logHabitatApiResponse("GET", "/modules", `${modules.length} modules`);

    return context.json({ modules });
  });

  app.get("/modules/:moduleId", (context) => {
    const moduleId = context.req.param("moduleId");
    const moduleRecord = loadModules()[moduleId];

    if (!moduleRecord) {
      logHabitatApiResponse("GET", `/modules/${moduleId}`, "Module not found.");
      return context.json({ error: "Module not found." }, 404);
    }

    logHabitatApiResponse("GET", `/modules/${moduleId}`, moduleRecord.id);
    return context.json({ module: moduleRecord });
  });

  app.post("/modules", async (context) => {
    const body = (await context.req.json()) as {
      blueprintId?: unknown;
      displayName?: unknown;
    };
    const blueprintId = typeof body.blueprintId === "string" ? body.blueprintId.trim() : "";
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";

    if (!blueprintId) {
      logHabitatApiResponse("POST", "/modules", "Blueprint ID is required.");
      return context.json({ error: "Blueprint ID is required." }, 400);
    }

    if (!displayName) {
      logHabitatApiResponse("POST", "/modules", "Module display name is required.");
      return context.json({ error: "Module display name is required." }, 400);
    }

    const blueprints = loadBlueprints();

    if (!blueprints[blueprintId]) {
      logHabitatApiResponse("POST", "/modules", `missing blueprint ${blueprintId}`);
      return context.json(
        {
          error: `No cached blueprint named "${blueprintId}" was found. Register first or use a cached blueprint ID.`,
        },
        404,
      );
    }

    const modules = loadModules();
    const moduleRecord = createLocalModule(modules, blueprints, blueprintId, displayName);
    modules[moduleRecord.id] = moduleRecord;
    saveModules(modules);
    logHabitatApiResponse("POST", "/modules", `created ${moduleRecord.id}`);

    return context.json({ module: moduleRecord });
  });

  app.patch("/modules/:moduleId", async (context) => {
    const moduleId = context.req.param("moduleId");
    const modules = loadModules();
    const moduleRecord = modules[moduleId];

    if (!moduleRecord) {
      logHabitatApiResponse("PATCH", `/modules/${moduleId}`, `missing module ${moduleId}`);
      return context.json({ error: `No local module named "${moduleId}" was found.` }, 404);
    }

    const body = (await context.req.json()) as {
      displayName?: unknown;
      status?: unknown;
      runtimeAttributes?: unknown;
    };

    let hasChanges = false;

    if (typeof body.displayName === "string") {
      moduleRecord.displayName = body.displayName;
      hasChanges = true;
    }

    if (typeof body.status === "string") {
      if (!isModuleRuntimeStatus(body.status)) {
        logHabitatApiResponse("PATCH", `/modules/${moduleId}`, `invalid status ${body.status}`);
        return context.json(
          {
            error: `Invalid status "${body.status}". Use one of: offline, idle, online, active, damaged.`,
          },
          400,
        );
      }

      setModuleRuntimeStatus(modules, moduleId, body.status);
      hasChanges = true;
    }

    if (
      body.runtimeAttributes &&
      typeof body.runtimeAttributes === "object" &&
      !Array.isArray(body.runtimeAttributes)
    ) {
      Object.assign(moduleRecord.runtimeAttributes, body.runtimeAttributes);
      hasChanges = true;
    }

    if (!hasChanges) {
      logHabitatApiResponse("PATCH", `/modules/${moduleId}`, "No updates were provided.");
      return context.json({ error: "No updates were provided." }, 400);
    }

    saveModules(modules);
    logHabitatApiResponse("PATCH", `/modules/${moduleId}`, `updated ${moduleId}`);

    return context.json({
      module: modules[moduleId],
      powerDrawKw: getModulePowerDrawKw(modules[moduleId]),
    });
  });

  app.delete("/modules/:moduleId", (context) => {
    const moduleId = context.req.param("moduleId");
    const modules = loadModules();

    if (!modules[moduleId]) {
      logHabitatApiResponse("DELETE", `/modules/${moduleId}`, `missing module ${moduleId}`);
      return context.json({ error: `No local module named "${moduleId}" was found.` }, 404);
    }

    const nextModules = disconnectDeletedModule(modules, moduleId);
    saveModules(nextModules);
    logHabitatApiResponse("DELETE", `/modules/${moduleId}`, "deleted");
    return context.body(null, 204);
  });

  app.get("/inventory", (context) => {
    const inventory = loadResourceInventory();
    logHabitatApiResponse(
      "GET",
      "/inventory",
      `${Object.keys(inventory).length} resources`,
    );
    return context.json({
      inventory,
    });
  });

  app.patch("/inventory", async (context) => {
    const body = (await context.req.json()) as {
      resourceType?: unknown;
      amount?: unknown;
    };
    const resourceType = typeof body.resourceType === "string" ? body.resourceType : "";
    const amount = typeof body.amount === "number" ? body.amount : Number(body.amount);

    try {
      const inventory = loadResourceInventory();
      const nextInventory = addResourceToInventory(inventory, resourceType, amount);
      saveResourceInventory(nextInventory);
      logHabitatApiResponse(
        "PATCH",
        "/inventory",
        `${resourceType}=${nextInventory[resourceType]}`,
      );

      return context.json({
        inventory: nextInventory,
        resourceType,
        amount,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logHabitatApiResponse("PATCH", "/inventory", message);
      return context.json({ error: message }, 400);
    }
  });

  app.get("/builds", (context) => {
    const builds = Object.values(loadBuilds()).sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    logHabitatApiResponse("GET", "/builds", `${builds.length} builds`);

    return context.json({ builds });
  });

  app.get("/builds/:buildId", (context) => {
    const buildId = context.req.param("buildId");
    const build = loadBuilds()[buildId];

    if (!build) {
      logHabitatApiResponse("GET", `/builds/${buildId}`, `missing build ${buildId}`);
      return context.json({ error: `No local build named "${buildId}" was found.` }, 404);
    }

    logHabitatApiResponse("GET", `/builds/${buildId}`, build.id);
    return context.json({ build });
  });

  app.post("/builds", async (context) => {
    const body = (await context.req.json()) as {
      blueprintId?: unknown;
      displayName?: unknown;
      dryRun?: unknown;
    };
    const blueprintId = typeof body.blueprintId === "string" ? body.blueprintId.trim() : "";
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    const dryRun = body.dryRun === true;

    if (!blueprintId || !displayName) {
      logHabitatApiResponse(
        "POST",
        "/builds",
        "Provide both `--blueprint-id` and `--name` to queue construction.",
      );
      return context.json(
        { error: "Provide both `--blueprint-id` and `--name` to queue construction." },
        400,
      );
    }

    try {
      const blueprints = loadBlueprints();
      const blueprint = validateBlueprintCanBuildAsModule(blueprints, blueprintId);
      const modules = loadModules();
      const builds = loadBuilds();
      synchronizeWorkshopAssignments(modules, builds);
      validateSupplyCacheOnline(modules);
      validateBuildFacilityRequirement(modules, blueprint);
      validateBuildFacilityAvailability(modules, builds, blueprint);

      const resourceInventory = loadResourceInventory();
      const nextInventory = spendResourceInventory(resourceInventory, blueprint.inputs ?? {});
      const buildRecord = createLocalBuild(builds, blueprint, displayName);
      const assignedFacilityModuleId = assignBuildFacility(modules, buildRecord);

      if (!dryRun) {
        builds[buildRecord.id] = buildRecord;
        saveModules(modules);
        saveResourceInventory(nextInventory);
        saveBuilds(builds);
      }
      logHabitatApiResponse(
        "POST",
        "/builds",
        dryRun ? `dry-run ${buildRecord.id}` : `queued ${buildRecord.id}`,
      );

      return context.json({
        build: buildRecord,
        assignedFacilityModuleId,
        inventory: nextInventory,
        dryRun,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logHabitatApiResponse("POST", "/builds", message);
      return context.json({ error: message }, 400);
    }
  });

  app.delete("/builds/:buildId", (context) => {
    const buildId = context.req.param("buildId");

    try {
      const result = cancelLocalBuild(loadModules(), loadBuilds(), buildId);
      saveModules(result.modules);
      saveBuilds(result.builds);
      logHabitatApiResponse("DELETE", `/builds/${buildId}`, `canceled ${buildId}`);

      return context.json({
        canceledBuild: result.canceledBuild,
        reason: result.reason,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logHabitatApiResponse("DELETE", `/builds/${buildId}`, message);
      return context.json({ error: message }, 404);
    }
  });

  app.post("/ticks", async (context) => {
    const registration = loadRegistration();

    if (!registration) {
      logHabitatApiResponse("POST", "/ticks", "This CLI is not registered with Kepler yet.");
      return context.json({ error: "This CLI is not registered with Kepler yet." }, 409);
    }

    const body = (await context.req.json()) as { tickCount?: unknown };
    const tickCount =
      typeof body.tickCount === "number" ? body.tickCount : Number(body.tickCount);

    if (!Number.isInteger(tickCount) || tickCount <= 0) {
      logHabitatApiResponse(
        "POST",
        "/ticks",
        `Invalid tick count "${body.tickCount}". Provide a positive whole number.`,
      );
      return context.json(
        { error: `Invalid tick count "${body.tickCount}". Provide a positive whole number.` },
        400,
      );
    }

    const modules = loadModules();
    const builds = loadBuilds();
    const blueprints = loadBlueprints();
    const solarResponse = await getWorldSolarIrradiance();
    const irradianceWPerM2 = solarResponse.solarIrradiance.wPerM2;
    const { modules: powerTickModules, summary: powerSummary } = runPowerTicks(
      modules,
      tickCount,
      irradianceWPerM2,
    );
    const {
      modules: postCancellationModules,
      builds: postCancellationBuilds,
      canceledBuilds,
    } = cancelBuildsForForcedOfflineModules(
      powerTickModules,
      builds,
      powerSummary.forcedOfflineModuleIds,
    );
    const {
      modules: nextModules,
      builds: nextBuilds,
      summary: buildSummary,
    } = advanceBuildQueue(postCancellationModules, postCancellationBuilds, blueprints, tickCount);

    saveModules(nextModules);
    saveBuilds(nextBuilds);
    logHabitatApiResponse("POST", "/ticks", `${tickCount} tick(s)`);

    return context.json({
      powerSummary,
      buildSummary,
      canceledBuilds,
    });
  });

  app.get("/catalog/blueprints", (context) => {
    const blueprints = Object.values(loadBlueprints()).sort((left, right) =>
      left.blueprintId.localeCompare(right.blueprintId),
    );
    logHabitatApiResponse("GET", "/catalog/blueprints", `${blueprints.length} blueprints`);

    return context.json({ blueprints });
  });

  app.get("/catalog/blueprints/:blueprintId", (context) => {
    const blueprintId = context.req.param("blueprintId");
    const blueprint = loadBlueprints()[blueprintId];

    if (!blueprint) {
      logHabitatApiResponse("GET", `/catalog/blueprints/${blueprintId}`, "Blueprint not found.");
      return context.json({ error: "Blueprint not found." }, 404);
    }

    logHabitatApiResponse("GET", `/catalog/blueprints/${blueprintId}`, blueprint.blueprintId);
    return context.json({ blueprint });
  });
}
