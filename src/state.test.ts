import { describe, expect, test } from "bun:test";
import {
  createLocalModule,
  disconnectDeletedModule,
  hydrateModulesFromStarterModules,
  indexBlueprints,
  getModulePowerDrawKw,
  isModuleRuntimeStatus,
  parseRuntimeAssignment,
  runPowerTick,
  runPowerTicks,
  setModuleRuntimeStatus,
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
          displayName: "Alpha",
          connectedTo: ["beta", "gamma"],
          runtimeAttributes: {},
          capabilities: [],
        },
        beta: {
          id: "beta",
          blueprintId: "b",
          moduleType: "b",
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
        displayName: "Alpha",
        connectedTo: ["gamma"],
        runtimeAttributes: {},
        capabilities: [],
      },
    });
  });

  test("runs a power tick and drains connected batteries", () => {
    const modules = {
      command: {
        id: "command",
        blueprintId: "command-module",
        moduleType: "command-module",
        displayName: "Command Module",
        connectedTo: ["battery-a", "battery-b"],
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
        displayName: "Battery A",
        connectedTo: ["command"],
        runtimeAttributes: { currentEnergyKwh: 2 },
        capabilities: [],
      },
      "battery-b": {
        id: "battery-b",
        blueprintId: "basic-battery",
        moduleType: "basic-battery",
        displayName: "Battery B",
        connectedTo: ["command"],
        runtimeAttributes: { currentEnergyKwh: 4 },
        capabilities: [],
      },
    };

    const result = runPowerTick(modules);

    expect(result.summary).toEqual({
      totalDemandKw: 3,
      totalDrainedKw: 3,
      shortfallKw: 0,
      batteriesUsed: [
        { moduleId: "battery-a", drainedKw: 2, remainingChargeKw: 0 },
        { moduleId: "battery-b", drainedKw: 1, remainingChargeKw: 3 },
      ],
    });
    expect(result.modules["battery-a"].runtimeAttributes.currentEnergyKwh).toBe(0);
    expect(result.modules["battery-b"].runtimeAttributes.currentEnergyKwh).toBe(3);
    expect(result.modules.command.runtimeAttributes.powerDrawKw).toEqual({
      offline: 0,
      online: 1,
      active: 3,
      damaged: 1,
    });
  });

  test("reports a power shortfall when batteries cannot cover demand", () => {
    const modules = {
      command: {
        id: "command",
        blueprintId: "command-module",
        moduleType: "command-module",
        displayName: "Command Module",
        connectedTo: ["battery-a"],
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
        displayName: "Battery A",
        connectedTo: ["command"],
        runtimeAttributes: { currentEnergyKwh: 2 },
        capabilities: [],
      },
      idle: {
        id: "idle",
        blueprintId: "supply-cache",
        moduleType: "supply-cache",
        displayName: "Idle Module",
        connectedTo: [],
        runtimeAttributes: {},
        capabilities: [],
      },
    };

    const result = runPowerTick(modules);

    expect(result.summary).toEqual({
      totalDemandKw: 5,
      totalDrainedKw: 2,
      shortfallKw: 3,
      batteriesUsed: [{ moduleId: "battery-a", drainedKw: 2, remainingChargeKw: 0 }],
    });
    expect(result.modules["battery-a"].runtimeAttributes.currentEnergyKwh).toBe(0);
    expect(result.modules.idle.runtimeAttributes).toEqual({});
  });

  test("ignores modules without power draw and batteries without charge", () => {
    const modules = {
      command: {
        id: "command",
        blueprintId: "command-module",
        moduleType: "command-module",
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
        displayName: "Battery A",
        connectedTo: ["command"],
        runtimeAttributes: { currentEnergyKwh: 0 },
        capabilities: [],
      },
    };

    const result = runPowerTick(modules);

    expect(result.summary).toEqual({
      totalDemandKw: 0,
      totalDrainedKw: 0,
      shortfallKw: 0,
      batteriesUsed: [],
    });
    expect(result.modules["battery-a"].runtimeAttributes.currentEnergyKwh).toBe(0);
  });

  test("runs multiple power ticks in sequence", () => {
    const modules = {
      command: {
        id: "command",
        blueprintId: "command-module",
        moduleType: "command-module",
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
        displayName: "Battery A",
        connectedTo: ["command"],
        runtimeAttributes: { currentEnergyKwh: 5 },
        capabilities: [],
      },
    };

    const result = runPowerTicks(modules, 2);

    expect(result.summary).toEqual({
      tickCount: 2,
      totalDemandKw: 4,
      totalDrainedKw: 4,
      shortfallKw: 0,
      batteriesUsed: [{ moduleId: "battery-a", drainedKw: 4, remainingChargeKw: 1 }],
    });
    expect(result.modules["battery-a"].runtimeAttributes.currentEnergyKwh).toBe(1);
  });

  test("reads module power draw from the current status", () => {
    const moduleRecord = {
      id: "command",
      blueprintId: "command-module",
      moduleType: "command-module",
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
});
