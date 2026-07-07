import { describe, expect, test } from "bun:test";
import {
  createLocalModule,
  disconnectDeletedModule,
  hydrateModulesFromStarterModules,
  indexBlueprints,
  parseRuntimeAssignment,
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
});
