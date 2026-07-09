import { describe, expect, test } from "bun:test";
import {
  advanceBuildQueue,
  addResourceToInventory,
  assignBuildFacility,
  cancelBuildsForForcedOfflineModules,
  cancelLocalBuild,
  createLocalBuild,
  createLocalModule,
  disconnectDeletedModule,
  spendResourceInventory,
  synchronizeWorkshopAssignments,
  hydrateModulesFromStarterModules,
  indexBlueprints,
  getModulePowerDrawKw,
  isModuleRuntimeStatus,
  parseRuntimeAssignment,
  runPowerTick,
  runPowerTicks,
  setModuleRuntimeStatus,
  validateBuildFacilityAvailability,
  validateBlueprintCanBuildAsModule,
  validateBuildFacilityRequirement,
  validateSupplyCacheOnline,
  type ProductionBlueprint,
  type StarterModuleInstance,
} from "./state";

describe("state helpers", () => {
  test("hydrates local modules from starter modules without hard-coding", () => {
    const blueprints: ProductionBlueprint[] = [
      {
        blueprintId: "command-module",
        displayName: "Command Module Blueprint",
        output: { moduleType: "command-module" },
        runtimeAttributes: { status: "idle" },
        capabilities: ["habitat-command"],
      },
    ];
    const starterModules: StarterModuleInstance[] = [
      {
        id: "kepler-1",
        blueprintId: "command-module",
        displayName: "Command Module",
        connectedTo: [],
        runtimeAttributes: { status: "active", health: 100 },
        capabilities: ["habitat-command"],
      },
      {
        id: "kepler-2",
        blueprintId: "command-module",
        displayName: "Command Module 2",
        connectedTo: [],
        runtimeAttributes: { status: "idle", health: 95 },
        capabilities: ["habitat-command"],
      },
    ];

    const modules = hydrateModulesFromStarterModules(
      starterModules,
      indexBlueprints(blueprints),
    );

    expect(modules["command-module-1"]).toEqual({
      id: "command-module-1",
      blueprintId: "command-module",
      moduleType: "command-module",
      moduleLevel: null,
      sourceStarterModuleId: "kepler-1",
      displayName: "Command Module",
      connectedTo: [],
      runtimeAttributes: { status: "active", health: 100 },
      capabilities: ["habitat-command"],
    });

    expect(modules["command-module-2"]).toEqual({
      id: "command-module-2",
      blueprintId: "command-module",
      moduleType: "command-module",
      moduleLevel: null,
      sourceStarterModuleId: "kepler-2",
      displayName: "Command Module 2",
      connectedTo: [],
      runtimeAttributes: { status: "idle", health: 95 },
      capabilities: ["habitat-command"],
    });
  });

  test("creates a local module from blueprint defaults", () => {
    const existingModules = hydrateModulesFromStarterModules(
      [
        {
          id: "kepler-1",
          blueprintId: "life-support",
          displayName: "Life Support",
          connectedTo: [],
          runtimeAttributes: { status: "active", health: 100 },
          capabilities: ["atmosphere-control"],
        },
      ],
      indexBlueprints([
        {
          blueprintId: "life-support",
          displayName: "Life Support Blueprint",
          output: { moduleType: "life-support" },
          runtimeAttributes: { status: "active", health: 100 },
          capabilities: ["atmosphere-control"],
        },
      ]),
    );

    const moduleRecord = createLocalModule(
      existingModules,
      indexBlueprints([
        {
          blueprintId: "life-support",
          displayName: "Life Support Blueprint",
          output: { moduleType: "life-support" },
          runtimeAttributes: { status: "active", health: 100 },
          capabilities: ["atmosphere-control"],
        },
      ]),
      "life-support",
      "Life Support Copy",
    );

    expect(moduleRecord.blueprintId).toBe("life-support");
    expect(moduleRecord.moduleType).toBe("life-support");
    expect(moduleRecord.moduleLevel).toBeNull();
    expect(moduleRecord.id).toBe("life-support-2");
    expect(moduleRecord.displayName).toBe("Life Support Copy");
    expect(moduleRecord.runtimeAttributes).toEqual({ status: "active", health: 100 });
    expect(moduleRecord.capabilities).toEqual(["atmosphere-control"]);
    expect(moduleRecord.connectedTo).toEqual([]);
  });

  test("parses runtime assignments into typed values", () => {
    expect(parseRuntimeAssignment("status=active")).toEqual({
      key: "status",
      value: "active",
    });
    expect(parseRuntimeAssignment("health=100")).toEqual({
      key: "health",
      value: 100,
    });
    expect(parseRuntimeAssignment("online=true")).toEqual({
      key: "online",
      value: true,
    });
  });

  test("removes deleted module references from connectedTo lists", () => {
    const modules = disconnectDeletedModule(
      {
        alpha: {
          id: "alpha",
          blueprintId: "a",
          moduleType: "a",
          moduleLevel: null,
          displayName: "Alpha",
          connectedTo: ["beta", "gamma"],
          runtimeAttributes: {},
          capabilities: [],
        },
        beta: {
          id: "beta",
          blueprintId: "b",
          moduleType: "b",
          moduleLevel: null,
          displayName: "Beta",
          connectedTo: [],
          runtimeAttributes: {},
          capabilities: [],
        },
      },
      "beta",
    );

    expect(modules).toEqual({
      alpha: {
        id: "alpha",
        blueprintId: "a",
        moduleType: "a",
        moduleLevel: null,
        displayName: "Alpha",
        connectedTo: ["gamma"],
        runtimeAttributes: {},
        capabilities: [],
      },
    });
  });

  test("runs a power tick from the shared battery pool", () => {
    const modules = {
      command: {
        id: "command",
        blueprintId: "command-module",
        moduleType: "command-module",
        moduleLevel: null,
        displayName: "Command Module",
        connectedTo: [],
        runtimeAttributes: {
          status: "active",
          powerDrawKw: {
            offline: 0,
            online: 1,
            active: 3,
            damaged: 1,
          },
        },
        capabilities: [],
      },
      "battery-a": {
        id: "battery-a",
        blueprintId: "basic-battery",
        moduleType: "basic-battery",
        moduleLevel: null,
        displayName: "Battery A",
        connectedTo: [],
        runtimeAttributes: { currentEnergyKwh: 2 },
        capabilities: [],
      },
      "battery-b": {
        id: "battery-b",
        blueprintId: "basic-battery",
        moduleType: "basic-battery",
        moduleLevel: null,
        displayName: "Battery B",
        connectedTo: [],
        runtimeAttributes: { currentEnergyKwh: 4 },
        capabilities: [],
      },
    };

    const result = runPowerTick(modules);

    expect(result.summary.totalPowerDrawKw).toBe(3);
    expect(result.summary.totalEnergyDemandKwh).toBeCloseTo(3 / 3600);
    expect(result.summary.totalEnergyDrainedKwh).toBeCloseTo(3 / 3600);
    expect(result.summary.energyShortfallKwh).toBe(0);
    expect(result.summary.batteriesUsed).toEqual([
      {
        moduleId: "battery-a",
        drainedEnergyKwh: 3 / 3600,
        remainingEnergyKwh: 2 - 3 / 3600,
      },
      {
        moduleId: "battery-b",
        drainedEnergyKwh: 0,
        remainingEnergyKwh: 4,
      },
    ]);
    expect(result.modules["battery-a"].runtimeAttributes.currentEnergyKwh).toBeCloseTo(
      2 - 3 / 3600,
    );
    expect(result.modules["battery-b"].runtimeAttributes.currentEnergyKwh).toBe(4);
    expect(result.modules.command.runtimeAttributes.powerDrawKw).toEqual({
      offline: 0,
      online: 1,
      active: 3,
      damaged: 1,
    });
    expect(result.summary.forcedOfflineModuleIds).toEqual([]);
  });

  test("reports a power shortfall and forces later modules offline in id order", () => {
    const modules = {
      alpha: {
        id: "alpha",
        blueprintId: "command-module",
        moduleType: "command-module",
        moduleLevel: null,
        displayName: "Alpha Module",
        runtimeAttributes: {
          status: "online",
          powerDrawKw: {
            offline: 0,
            online: 5,
            active: 6,
            damaged: 2,
          },
        },
        capabilities: [],
      },
      "battery-a": {
        id: "battery-a",
        blueprintId: "basic-battery",
        moduleType: "basic-battery",
        moduleLevel: null,
        displayName: "Battery A",
        runtimeAttributes: { currentEnergyKwh: 0.001 },
        capabilities: [],
      },
      beta: {
        id: "beta",
        blueprintId: "life-support",
        moduleType: "life-support",
        moduleLevel: null,
        displayName: "Beta Module",
        runtimeAttributes: {
          status: "active",
          powerDrawKw: {
            offline: 0,
            online: 4,
            active: 4,
            damaged: 1,
          },
        },
        capabilities: [],
      },
    };

    const result = runPowerTick(modules);

    expect(result.summary.totalPowerDrawKw).toBe(9);
    expect(result.summary.totalEnergyDemandKwh).toBeCloseTo(9 / 3600);
    expect(result.summary.totalEnergyDrainedKwh).toBe(0);
    expect(result.summary.energyShortfallKwh).toBeCloseTo(9 / 3600);
    expect(result.summary.batteriesUsed).toEqual([
      {
        moduleId: "battery-a",
        drainedEnergyKwh: 0,
        remainingEnergyKwh: 0.001,
      },
    ]);
    expect(result.modules["battery-a"].runtimeAttributes.currentEnergyKwh).toBe(0.001);
    expect(result.modules.alpha.runtimeAttributes.status).toBe("offline");
    expect(result.modules.beta.runtimeAttributes.status).toBe("offline");
    expect(result.summary.forcedOfflineModuleIds).toEqual(["alpha", "beta"]);
  });

  test("ignores modules without power draw and batteries without charge", () => {
    const modules = {
      command: {
        id: "command",
        blueprintId: "command-module",
        moduleType: "command-module",
        moduleLevel: null,
        displayName: "Command Module",
        connectedTo: ["battery-a"],
        runtimeAttributes: {
          status: "offline",
          powerDrawKw: {
            offline: 0,
            online: 2,
            active: 4,
            damaged: 1,
          },
        },
        capabilities: [],
      },
      "battery-a": {
        id: "battery-a",
        blueprintId: "basic-battery",
        moduleType: "basic-battery",
        moduleLevel: null,
        displayName: "Battery A",
        connectedTo: ["command"],
        runtimeAttributes: { currentEnergyKwh: 0 },
        capabilities: [],
      },
    };

    const result = runPowerTick(modules);

    expect(result.summary).toEqual({
      totalPowerDrawKw: 0,
      totalEnergyDemandKwh: 0,
      totalEnergyDrainedKwh: 0,
      energyShortfallKwh: 0,
      batteriesUsed: [
        {
          moduleId: "battery-a",
          drainedEnergyKwh: 0,
          remainingEnergyKwh: 0,
        },
      ],
      forcedOfflineModuleIds: [],
    });
    expect(result.modules["battery-a"].runtimeAttributes.currentEnergyKwh).toBe(0);
  });

  test("runs multiple power ticks in sequence", () => {
    const modules = {
      command: {
        id: "command",
        blueprintId: "command-module",
        moduleType: "command-module",
        moduleLevel: null,
        displayName: "Command Module",
        connectedTo: ["battery-a"],
        runtimeAttributes: {
          status: "active",
          powerDrawKw: {
            offline: 0,
            online: 1,
            active: 2,
            damaged: 1,
          },
        },
        capabilities: [],
      },
      "battery-a": {
        id: "battery-a",
        blueprintId: "basic-battery",
        moduleType: "basic-battery",
        moduleLevel: null,
        displayName: "Battery A",
        connectedTo: ["command"],
        runtimeAttributes: { currentEnergyKwh: 5 },
        capabilities: [],
      },
    };

    const result = runPowerTicks(modules, 2);

    expect(result.summary.tickCount).toBe(2);
    expect(result.summary.averagePowerDrawKw).toBe(2);
    expect(result.summary.totalEnergyDemandKwh).toBeCloseTo(4 / 3600);
    expect(result.summary.totalEnergyDrainedKwh).toBeCloseTo(4 / 3600);
    expect(result.summary.energyShortfallKwh).toBe(0);
    expect(result.summary.batteriesUsed).toEqual([
      {
        moduleId: "battery-a",
        drainedEnergyKwh: 4 / 3600,
        remainingEnergyKwh: 5 - 4 / 3600,
      },
    ]);
    expect(result.summary.forcedOfflineModuleIds).toEqual([]);
    expect(result.modules["battery-a"].runtimeAttributes.currentEnergyKwh).toBeCloseTo(
      5 - 4 / 3600,
    );
  });

  test("keeps forced-offline modules offline on later ticks until manually changed", () => {
    const modules = {
      alpha: {
        id: "alpha",
        blueprintId: "command-module",
        moduleType: "command-module",
        moduleLevel: null,
        displayName: "Alpha Module",
        connectedTo: [],
        runtimeAttributes: {
          status: "offline",
          powerDrawKw: {
            offline: 0,
            online: 2,
            active: 2,
            damaged: 1,
          },
        },
        capabilities: [],
      },
      "battery-a": {
        id: "battery-a",
        blueprintId: "basic-battery",
        moduleType: "basic-battery",
        moduleLevel: null,
        displayName: "Battery A",
        connectedTo: [],
        runtimeAttributes: { currentEnergyKwh: 1 },
        capabilities: [],
      },
    };

    const result = runPowerTick(modules);

    expect(result.modules.alpha.runtimeAttributes.status).toBe("offline");
    expect(result.summary.totalPowerDrawKw).toBe(0);
    expect(result.summary.forcedOfflineModuleIds).toEqual([]);
  });

  test("removes battery links from stored module connections", () => {
    const modules = hydrateModulesFromStarterModules(
      [
        {
          id: "starter-1",
          blueprintId: "command-module",
          displayName: "Command Module",
          connectedTo: ["basic-battery-1", "life-support-1"],
          runtimeAttributes: { status: "active" },
          capabilities: [],
        },
      ],
      indexBlueprints([
        {
          blueprintId: "command-module",
          displayName: "Command Module Blueprint",
          output: { moduleType: "command-module" },
        },
      ]),
    );

    expect(modules["command-module-1"].connectedTo).toEqual(["life-support-1"]);
  });

  test("reads module power draw from the current status", () => {
    const moduleRecord = {
      id: "command",
      blueprintId: "command-module",
      moduleType: "command-module",
      moduleLevel: null,
      displayName: "Command Module",
      connectedTo: [],
      runtimeAttributes: {
        status: "damaged",
        powerDrawKw: {
          offline: 0,
          online: 2,
          active: 4,
          damaged: 1.5,
        },
      },
      capabilities: [],
    };

    expect(getModulePowerDrawKw(moduleRecord)).toBe(1.5);
  });

  test("sets only a module's runtime status", () => {
    const modules = {
      command: {
        id: "command",
        blueprintId: "command-module",
        moduleType: "command-module",
        moduleLevel: null,
        displayName: "Command Module",
        connectedTo: ["battery-a"],
        runtimeAttributes: {
          status: "offline",
          powerDrawKw: {
            offline: 0,
            online: 2,
            active: 4,
            damaged: 1,
          },
          crewCapacity: 2,
        },
        capabilities: [],
      },
    };

    const moduleRecord = setModuleRuntimeStatus(modules, "command", "active");

    expect(moduleRecord.runtimeAttributes.status).toBe("active");
    expect(moduleRecord.runtimeAttributes.powerDrawKw).toEqual({
      offline: 0,
      online: 2,
      active: 4,
      damaged: 1,
    });
    expect(moduleRecord.runtimeAttributes.crewCapacity).toBe(2);
  });

  test("recognizes allowed module statuses", () => {
    expect(isModuleRuntimeStatus("offline")).toBe(true);
    expect(isModuleRuntimeStatus("idle")).toBe(true);
    expect(isModuleRuntimeStatus("online")).toBe(true);
    expect(isModuleRuntimeStatus("active")).toBe(true);
    expect(isModuleRuntimeStatus("damaged")).toBe(true);
    expect(isModuleRuntimeStatus("broken")).toBe(false);
  });

  test("adds resource quantities to the local inventory", () => {
    expect(addResourceToInventory({}, "water", 50)).toEqual({ water: 50 });
    expect(addResourceToInventory({ water: 50 }, "water", 25)).toEqual({ water: 75 });
    expect(addResourceToInventory({ water: 50 }, "ferrite", 10)).toEqual({
      water: 50,
      ferrite: 10,
    });
  });

  test("accepts a valid module blueprint for building", () => {
    const blueprints = indexBlueprints([
      {
        blueprintId: "greenhouse",
        displayName: "Greenhouse Blueprint",
        output: { itemType: "module", moduleType: "greenhouse" },
      },
    ]);

    const blueprint = validateBlueprintCanBuildAsModule(blueprints, "greenhouse");
    expect(blueprint.blueprintId).toBe("greenhouse");
  });

  test("rejects a missing cached build blueprint", () => {
    expect(() => validateBlueprintCanBuildAsModule({}, "greenhouse")).toThrow(
      'No cached blueprint named "greenhouse" was found. Register first or use a cached blueprint ID.',
    );
  });

  test("rejects a non-module build blueprint", () => {
    const blueprints = indexBlueprints([
      {
        blueprintId: "survey-rover",
        displayName: "Survey Rover Blueprint",
        output: { itemType: "rover" },
      },
    ]);

    expect(() => validateBlueprintCanBuildAsModule(blueprints, "survey-rover")).toThrow(
      'Blueprint "survey-rover" cannot be built with `habitat construct` because it does not output a module.',
    );
  });

  test("rejects insufficient local resources for a build", () => {
    expect(() =>
      spendResourceInventory({ ferrite: 10 }, { ferrite: 12, "conductive-ore": 1 }),
    ).toThrow('Not enough ferrite. Need 12, but only 10 is available.');
  });

  test("spends resources at build start", () => {
    expect(
      spendResourceInventory(
        { ferrite: 20, "conductive-ore": 5 },
        { ferrite: 12, "conductive-ore": 1 },
      ),
    ).toEqual({
      ferrite: 8,
      "conductive-ore": 4,
    });
  });

  test("simulates resource spending without mutating the original inventory", () => {
    const originalInventory = {
      ferrite: 20,
      "conductive-ore": 5,
    };

    const nextInventory = spendResourceInventory(originalInventory, {
      ferrite: 12,
      "conductive-ore": 1,
    });

    expect(originalInventory).toEqual({
      ferrite: 20,
      "conductive-ore": 5,
    });
    expect(nextInventory).toEqual({
      ferrite: 8,
      "conductive-ore": 4,
    });
  });

  test("rejects build when the required facility is missing", () => {
    expect(() =>
      validateBuildFacilityRequirement(
        {},
        {
          blueprintId: "greenhouse",
          displayName: "Greenhouse Blueprint",
          requiredFacility: { moduleType: "workshop-fabricator", minimumLevel: 1 },
        },
      ),
    ).toThrow(
      'Building "greenhouse" requires a workshop-fabricator at level 1 or higher.',
    );
  });

  test("rejects build when no supply-cache is online", () => {
    expect(() =>
      validateSupplyCacheOnline({
        "supply-cache-1": {
          id: "supply-cache-1",
          blueprintId: "supply-cache",
          moduleType: "supply-cache",
          moduleLevel: null,
          displayName: "Supply Cache",
          connectedTo: [],
          runtimeAttributes: { status: "offline" },
          capabilities: ["storage"],
        },
      }),
    ).toThrow(
      'Starting a module build requires at least one supply-cache to be set to "online".',
    );
  });

  test("accepts build when a supply-cache is online", () => {
    expect(() =>
      validateSupplyCacheOnline({
        "supply-cache-1": {
          id: "supply-cache-1",
          blueprintId: "supply-cache",
          moduleType: "supply-cache",
          moduleLevel: null,
          displayName: "Supply Cache",
          connectedTo: [],
          runtimeAttributes: { status: "online" },
          capabilities: ["storage"],
        },
      }),
    ).not.toThrow();
  });

  test("rejects build when the required facility is below the minimum level", () => {
    expect(() =>
      validateBuildFacilityRequirement(
        {
          "workshop-fabricator-1": {
            id: "workshop-fabricator-1",
            blueprintId: "workshop-fabricator",
            moduleType: "workshop-fabricator",
            moduleLevel: 1,
            displayName: "Workshop Fabricator",
            connectedTo: [],
            runtimeAttributes: {},
            capabilities: [],
          },
        },
        {
          blueprintId: "advanced-greenhouse",
          displayName: "Advanced Greenhouse Blueprint",
          requiredFacility: { moduleType: "workshop-fabricator", minimumLevel: 2 },
        },
      ),
    ).toThrow(
      'Building "advanced-greenhouse" requires a workshop-fabricator at level 2 or higher.',
    );
  });

  test("rejects build when the required workshop-fabricator is not active", () => {
    expect(() =>
      validateBuildFacilityRequirement(
        {
          "workshop-fabricator-1": {
            id: "workshop-fabricator-1",
            blueprintId: "workshop-fabricator",
            moduleType: "workshop-fabricator",
            moduleLevel: 1,
            displayName: "Workshop Fabricator",
            connectedTo: [],
            runtimeAttributes: { status: "online" },
            capabilities: [],
          },
        },
        {
          blueprintId: "greenhouse",
          displayName: "Greenhouse Blueprint",
          requiredFacility: { moduleType: "workshop-fabricator", minimumLevel: 1 },
        },
      ),
    ).toThrow(
      'Building "greenhouse" requires a workshop-fabricator at level 1 or higher that is set to "active".',
    );
  });

  test("accepts build when the required facility exists at the needed level", () => {
    expect(() =>
      validateBuildFacilityRequirement(
        {
          "workshop-fabricator-1": {
            id: "workshop-fabricator-1",
            blueprintId: "workshop-fabricator",
            moduleType: "workshop-fabricator",
            moduleLevel: 2,
            displayName: "Workshop Fabricator",
            connectedTo: [],
            runtimeAttributes: { status: "active" },
            capabilities: [],
          },
        },
        {
          blueprintId: "greenhouse",
          displayName: "Greenhouse Blueprint",
          requiredFacility: { moduleType: "workshop-fabricator", minimumLevel: 2 },
        },
      ),
    ).not.toThrow();
  });

  test("rejects build when all active workshop-fabricators are already busy", () => {
    expect(() =>
      validateBuildFacilityAvailability(
        {
          "workshop-fabricator-1": {
            id: "workshop-fabricator-1",
            blueprintId: "workshop-fabricator",
            moduleType: "workshop-fabricator",
            moduleLevel: 1,
            displayName: "Workshop Fabricator",
            connectedTo: [],
            runtimeAttributes: { status: "active" },
            capabilities: [],
          },
        },
        {
          "basic-battery-build-1": {
            id: "basic-battery-build-1",
            blueprintId: "basic-battery",
            displayName: "Battery One",
            moduleType: "basic-battery",
            status: "queued",
            requiredTicks: 180,
            remainingTicks: 180,
            startedAt: "2026-07-09T00:00:00.000Z",
            requiredFacility: {
              moduleType: "workshop-fabricator",
              minimumLevel: 1,
            },
            consumedResources: { ferrite: 55 },
          },
        },
        {
          blueprintId: "greenhouse",
          displayName: "Greenhouse Blueprint",
          requiredFacility: { moduleType: "workshop-fabricator", minimumLevel: 1 },
        },
      ),
    ).toThrow(
      'All active workshop-fabricators are already busy. Finish a queued workshop build before starting "greenhouse".',
    );
  });

  test("accepts build when another active workshop-fabricator is free", () => {
    expect(() =>
      validateBuildFacilityAvailability(
        {
          "workshop-fabricator-1": {
            id: "workshop-fabricator-1",
            blueprintId: "workshop-fabricator",
            moduleType: "workshop-fabricator",
            moduleLevel: 1,
            displayName: "Workshop Fabricator A",
            connectedTo: [],
            runtimeAttributes: { status: "active" },
            capabilities: [],
          },
          "workshop-fabricator-2": {
            id: "workshop-fabricator-2",
            blueprintId: "workshop-fabricator",
            moduleType: "workshop-fabricator",
            moduleLevel: 1,
            displayName: "Workshop Fabricator B",
            connectedTo: [],
            runtimeAttributes: { status: "active" },
            capabilities: [],
          },
        },
        {
          "basic-battery-build-1": {
            id: "basic-battery-build-1",
            blueprintId: "basic-battery",
            displayName: "Battery One",
            moduleType: "basic-battery",
            status: "queued",
            requiredTicks: 180,
            remainingTicks: 180,
            startedAt: "2026-07-09T00:00:00.000Z",
            requiredFacility: {
              moduleType: "workshop-fabricator",
              minimumLevel: 1,
            },
            consumedResources: { ferrite: 55 },
          },
        },
        {
          blueprintId: "greenhouse",
          displayName: "Greenhouse Blueprint",
          requiredFacility: { moduleType: "workshop-fabricator", minimumLevel: 1 },
        },
      ),
    ).not.toThrow();
  });

  test("creates a queued local build record", () => {
    const buildRecord = createLocalBuild(
      {},
      {
        blueprintId: "greenhouse",
        displayName: "Greenhouse Blueprint",
        output: { itemType: "module", moduleType: "greenhouse" },
        buildTicks: 420,
        inputs: { ferrite: 20 },
        requiredFacility: { moduleType: "workshop-fabricator", minimumLevel: 1 },
      },
      "Greenhouse Alpha",
    );

    expect(buildRecord.id).toBe("greenhouse-build-1");
    expect(buildRecord.requiredTicks).toBe(420);
    expect(buildRecord.remainingTicks).toBe(420);
    expect(buildRecord.consumedResources).toEqual({ ferrite: 20 });
    expect(buildRecord.requiredFacility).toEqual({
      moduleType: "workshop-fabricator",
      minimumLevel: 1,
    });
  });

  test("assigns a queued workshop build to a specific fabricator job slot", () => {
    const modules = {
      "workshop-fabricator-1": {
        id: "workshop-fabricator-1",
        blueprintId: "workshop-fabricator",
        moduleType: "workshop-fabricator",
        moduleLevel: 1,
        displayName: "Workshop Fabricator",
        connectedTo: [],
        runtimeAttributes: { status: "active" },
        capabilities: [],
      },
    };

    const buildRecord = createLocalBuild(
      {},
      {
        blueprintId: "basic-battery",
        displayName: "Basic Battery Blueprint",
        output: { itemType: "module", moduleType: "basic-battery" },
        buildTicks: 180,
        inputs: { ferrite: 55 },
        requiredFacility: { moduleType: "workshop-fabricator", minimumLevel: 1 },
      },
      "Battery One",
    );

    const assignedFacilityModuleId = assignBuildFacility(modules, buildRecord);

    expect(assignedFacilityModuleId).toBe("workshop-fabricator-1");
    expect(buildRecord.assignedFacilityModuleId).toBe("workshop-fabricator-1");
    expect(modules["workshop-fabricator-1"].runtimeAttributes.currentJobId).toBe(
      "basic-battery-build-1",
    );
  });

  test("synchronizes workshop currentJobId from queued builds", () => {
    const modules = {
      "workshop-fabricator-1": {
        id: "workshop-fabricator-1",
        blueprintId: "workshop-fabricator",
        moduleType: "workshop-fabricator",
        moduleLevel: 1,
        displayName: "Workshop Fabricator",
        connectedTo: [],
        runtimeAttributes: { status: "active" },
        capabilities: [],
      },
    };

    const builds = {
      "basic-battery-build-1": {
        id: "basic-battery-build-1",
        blueprintId: "basic-battery",
        displayName: "Battery One",
        moduleType: "basic-battery",
        status: "queued" as const,
        requiredTicks: 180,
        remainingTicks: 180,
        startedAt: "2026-07-09T00:00:00.000Z",
        requiredFacility: {
          moduleType: "workshop-fabricator",
          minimumLevel: 1,
        },
        consumedResources: { ferrite: 55 },
      },
    };

    synchronizeWorkshopAssignments(modules, builds);

    expect(builds["basic-battery-build-1"].assignedFacilityModuleId).toBe(
      "workshop-fabricator-1",
    );
    expect(modules["workshop-fabricator-1"].runtimeAttributes.currentJobId).toBe(
      "basic-battery-build-1",
    );
  });

  test("can prepare a build preview without mutating the build queue", () => {
    const existingBuilds = {
      "basic-battery-build-1": {
        id: "basic-battery-build-1",
        blueprintId: "basic-battery",
        displayName: "Battery One",
        moduleType: "basic-battery",
        status: "queued" as const,
        requiredTicks: 180,
        remainingTicks: 180,
        startedAt: "2026-07-09T00:00:00.000Z",
        requiredFacility: null,
        consumedResources: { ferrite: 55 },
      },
    };

    const buildRecord = createLocalBuild(
      existingBuilds,
      {
        blueprintId: "basic-battery",
        displayName: "Basic Battery Blueprint",
        output: { itemType: "module", moduleType: "basic-battery" },
        buildTicks: 180,
        inputs: { ferrite: 55 },
      },
      "Battery Two",
    );

    expect(existingBuilds).toEqual({
      "basic-battery-build-1": {
        id: "basic-battery-build-1",
        blueprintId: "basic-battery",
        displayName: "Battery One",
        moduleType: "basic-battery",
        status: "queued",
        requiredTicks: 180,
        remainingTicks: 180,
        startedAt: "2026-07-09T00:00:00.000Z",
        requiredFacility: null,
        consumedResources: { ferrite: 55 },
      },
    });
    expect(buildRecord.id).toBe("basic-battery-build-2");
  });

  test("cancels a queued build without refunding materials and reports the reason", () => {
    const result = cancelLocalBuild(
      {
        "workshop-fabricator-1": {
          id: "workshop-fabricator-1",
          blueprintId: "workshop-fabricator",
          moduleType: "workshop-fabricator",
          moduleLevel: 1,
          displayName: "Workshop Fabricator",
          connectedTo: [],
          runtimeAttributes: {
            status: "active",
            currentJobId: "basic-battery-build-1",
          },
          capabilities: [],
        },
      },
      {
        "basic-battery-build-1": {
          id: "basic-battery-build-1",
          blueprintId: "basic-battery",
          displayName: "Battery One",
          moduleType: "basic-battery",
          assignedFacilityModuleId: "workshop-fabricator-1",
          status: "queued",
          requiredTicks: 180,
          remainingTicks: 180,
          startedAt: "2026-07-09T00:00:00.000Z",
          requiredFacility: {
            moduleType: "workshop-fabricator",
            minimumLevel: 1,
          },
          consumedResources: { ferrite: 55 },
        },
      },
      "basic-battery-build-1",
    );

    expect(result.reason).toBe("manually cancel");
    expect(result.canceledBuild.id).toBe("basic-battery-build-1");
    expect(result.canceledBuild.consumedResources).toEqual({ ferrite: 55 });
    expect(result.builds).toEqual({});
    expect(result.modules["workshop-fabricator-1"].runtimeAttributes.currentJobId).toBeUndefined();
  });

  test("can cancel a queued build with a custom reason", () => {
    const result = cancelLocalBuild(
      {
        "workshop-fabricator-1": {
          id: "workshop-fabricator-1",
          blueprintId: "workshop-fabricator",
          moduleType: "workshop-fabricator",
          moduleLevel: 1,
          displayName: "Workshop Fabricator",
          connectedTo: [],
          runtimeAttributes: {
            status: "offline",
            currentJobId: "basic-battery-build-1",
          },
          capabilities: [],
        },
      },
      {
        "basic-battery-build-1": {
          id: "basic-battery-build-1",
          blueprintId: "basic-battery",
          displayName: "Battery One",
          moduleType: "basic-battery",
          assignedFacilityModuleId: "workshop-fabricator-1",
          status: "queued",
          requiredTicks: 180,
          remainingTicks: 180,
          startedAt: "2026-07-09T00:00:00.000Z",
          requiredFacility: {
            moduleType: "workshop-fabricator",
            minimumLevel: 1,
          },
          consumedResources: { ferrite: 55 },
        },
      },
      "basic-battery-build-1",
      "assigned workshop-fabricator forced offline",
    );

    expect(result.reason).toBe("assigned workshop-fabricator forced offline");
    expect(result.builds).toEqual({});
  });

  test("cancels a workshop build when its fabricator is forced offline", () => {
    const result = cancelBuildsForForcedOfflineModules(
      {
        "workshop-fabricator-1": {
          id: "workshop-fabricator-1",
          blueprintId: "workshop-fabricator",
          moduleType: "workshop-fabricator",
          moduleLevel: 1,
          displayName: "Workshop Fabricator",
          connectedTo: [],
          runtimeAttributes: {
            status: "offline",
            currentJobId: "basic-battery-build-1",
          },
          capabilities: [],
        },
      },
      {
        "basic-battery-build-1": {
          id: "basic-battery-build-1",
          blueprintId: "basic-battery",
          displayName: "Battery One",
          moduleType: "basic-battery",
          assignedFacilityModuleId: "workshop-fabricator-1",
          status: "queued",
          requiredTicks: 180,
          remainingTicks: 180,
          startedAt: "2026-07-09T00:00:00.000Z",
          requiredFacility: {
            moduleType: "workshop-fabricator",
            minimumLevel: 1,
          },
          consumedResources: { ferrite: 55 },
        },
      },
      ["workshop-fabricator-1"],
    );

    expect(result.builds).toEqual({});
    expect(result.modules["workshop-fabricator-1"].runtimeAttributes.currentJobId).toBeUndefined();
    expect(result.canceledBuilds).toEqual([
      {
        buildId: "basic-battery-build-1",
        displayName: "Battery One",
        reason: "assigned workshop-fabricator forced offline",
      },
    ]);
  });

  test("reassigns the next queued workshop job after a cancellation", () => {
    const result = cancelLocalBuild(
      {
        "workshop-fabricator-1": {
          id: "workshop-fabricator-1",
          blueprintId: "workshop-fabricator",
          moduleType: "workshop-fabricator",
          moduleLevel: 1,
          displayName: "Workshop Fabricator",
          connectedTo: [],
          runtimeAttributes: {
            status: "active",
            currentJobId: "basic-battery-build-1",
          },
          capabilities: [],
        },
      },
      {
        "basic-battery-build-1": {
          id: "basic-battery-build-1",
          blueprintId: "basic-battery",
          displayName: "Battery One",
          moduleType: "basic-battery",
          assignedFacilityModuleId: "workshop-fabricator-1",
          status: "queued",
          requiredTicks: 180,
          remainingTicks: 180,
          startedAt: "2026-07-09T00:00:00.000Z",
          requiredFacility: {
            moduleType: "workshop-fabricator",
            minimumLevel: 1,
          },
          consumedResources: { ferrite: 55 },
        },
        "greenhouse-build-1": {
          id: "greenhouse-build-1",
          blueprintId: "greenhouse",
          displayName: "Greenhouse One",
          moduleType: "greenhouse",
          status: "queued",
          requiredTicks: 420,
          remainingTicks: 420,
          startedAt: "2026-07-09T00:00:00.000Z",
          requiredFacility: {
            moduleType: "workshop-fabricator",
            minimumLevel: 1,
          },
          consumedResources: { ferrite: 120 },
        },
      },
      "basic-battery-build-1",
    );

    expect(result.builds["greenhouse-build-1"].assignedFacilityModuleId).toBe(
      "workshop-fabricator-1",
    );
    expect(result.modules["workshop-fabricator-1"].runtimeAttributes.currentJobId).toBe(
      "greenhouse-build-1",
    );
  });

  test("advances queued builds without completing them early", () => {
    const result = advanceBuildQueue(
      {},
      {
        "greenhouse-build-1": {
          id: "greenhouse-build-1",
          blueprintId: "greenhouse",
          displayName: "Greenhouse Alpha",
          moduleType: "greenhouse",
          status: "queued",
          requiredTicks: 10,
          remainingTicks: 10,
          startedAt: "2026-07-09T00:00:00.000Z",
          requiredFacility: null,
          consumedResources: { ferrite: 10 },
        },
      },
      indexBlueprints([
        {
          blueprintId: "greenhouse",
          displayName: "Greenhouse Blueprint",
          output: { itemType: "module", moduleType: "greenhouse" },
          runtimeAttributes: { status: "online" },
          capabilities: ["food-production"],
        },
      ]),
      4,
    );

    expect(result.summary.advancedBuilds).toBe(1);
    expect(result.summary.completedBuilds).toEqual([]);
    expect(result.builds["greenhouse-build-1"].remainingTicks).toBe(6);
  });

  test("completes queued builds into local modules with short ids", () => {
    const result = advanceBuildQueue(
      {
        "greenhouse-1": {
          id: "greenhouse-1",
          blueprintId: "greenhouse",
          moduleType: "greenhouse",
          moduleLevel: null,
          displayName: "Greenhouse Existing",
          connectedTo: [],
          runtimeAttributes: { status: "online" },
          capabilities: [],
        },
      },
      {
        "greenhouse-build-1": {
          id: "greenhouse-build-1",
          blueprintId: "greenhouse",
          displayName: "Greenhouse Alpha",
          moduleType: "greenhouse",
          status: "queued",
          requiredTicks: 5,
          remainingTicks: 2,
          startedAt: "2026-07-09T00:00:00.000Z",
          requiredFacility: null,
          consumedResources: { ferrite: 10 },
        },
      },
      indexBlueprints([
        {
          blueprintId: "greenhouse",
          displayName: "Greenhouse Blueprint",
          output: { itemType: "module", moduleType: "greenhouse" },
          runtimeAttributes: { status: "online", health: 100 },
          capabilities: ["food-production"],
        },
      ]),
      2,
    );

    expect(result.builds).toEqual({});
    expect(result.summary.completedBuilds).toEqual([
      {
        buildId: "greenhouse-build-1",
        moduleId: "greenhouse-2",
        displayName: "Greenhouse Alpha",
      },
    ]);
    expect(result.modules["greenhouse-2"]).toEqual({
      id: "greenhouse-2",
      blueprintId: "greenhouse",
      moduleType: "greenhouse",
      moduleLevel: null,
      displayName: "Greenhouse Alpha",
      connectedTo: [],
      runtimeAttributes: { status: "online", health: 100 },
      capabilities: ["food-production"],
    });
  });

  test("clears the fabricator current job when a workshop build completes", () => {
    const result = advanceBuildQueue(
      {
        "workshop-fabricator-1": {
          id: "workshop-fabricator-1",
          blueprintId: "workshop-fabricator",
          moduleType: "workshop-fabricator",
          moduleLevel: 1,
          displayName: "Workshop Fabricator",
          connectedTo: [],
          runtimeAttributes: {
            status: "active",
            currentJobId: "basic-battery-build-1",
          },
          capabilities: [],
        },
      },
      {
        "basic-battery-build-1": {
          id: "basic-battery-build-1",
          blueprintId: "basic-battery",
          displayName: "Battery One",
          moduleType: "basic-battery",
          assignedFacilityModuleId: "workshop-fabricator-1",
          status: "queued",
          requiredTicks: 180,
          remainingTicks: 1,
          startedAt: "2026-07-09T00:00:00.000Z",
          requiredFacility: {
            moduleType: "workshop-fabricator",
            minimumLevel: 1,
          },
          consumedResources: { ferrite: 55 },
        },
      },
      indexBlueprints([
        {
          blueprintId: "basic-battery",
          displayName: "Basic Battery Blueprint",
          output: { itemType: "module", moduleType: "basic-battery" },
          runtimeAttributes: { status: "offline", currentEnergyKwh: 500 },
          capabilities: ["power-storage"],
        },
      ]),
      1,
    );

    expect(result.builds).toEqual({});
    expect(result.modules["workshop-fabricator-1"].runtimeAttributes.currentJobId).toBeUndefined();
  });
});
