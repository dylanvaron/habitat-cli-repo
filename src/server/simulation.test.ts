import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { createServerApp } from "./app";
import {
  deleteAllLocalState,
  saveBlueprints,
  saveBuilds,
  saveModules,
  saveRegistration,
  type BlueprintIndex,
  type BuildIndex,
  type LocalRegistration,
  type ModuleIndex,
} from "../state";

const originalFetch = globalThis.fetch;
const originalToken = process.env.KEPLER_PLANET_TOKEN;
const originalBaseUrl = process.env.KEPLER_BASE_URL;

describe("simulation routes", () => {
  beforeEach(() => {
    deleteAllLocalState();
    process.env.KEPLER_PLANET_TOKEN = "test-token";
    process.env.KEPLER_BASE_URL = "https://planet.turingguild.com/";
  });

  afterEach(() => {
    deleteAllLocalState();
    globalThis.fetch = originalFetch;

    if (originalToken === undefined) {
      delete process.env.KEPLER_PLANET_TOKEN;
    } else {
      process.env.KEPLER_PLANET_TOKEN = originalToken;
    }

    if (originalBaseUrl === undefined) {
      delete process.env.KEPLER_BASE_URL;
    } else {
      process.env.KEPLER_BASE_URL = originalBaseUrl;
    }
  });

  test("creates and cancels builds through the backend", async () => {
    const registration: LocalRegistration = {
      habitatId: "hab_123",
      habitatUuid: "uuid-123",
      displayName: "Artemis Ridge",
      baseUrl: "https://planet.turingguild.com",
      registeredAt: "2026-07-10T00:00:00.000Z",
    };
    saveRegistration(registration);
    const blueprints: BlueprintIndex = {
      "supply-cache": {
        blueprintId: "supply-cache",
        displayName: "Supply Cache",
        output: { moduleType: "supply-cache" },
        runtimeAttributes: { status: "online" },
        capabilities: [],
      },
      greenhouse: {
        blueprintId: "greenhouse",
        displayName: "Greenhouse Blueprint",
        output: { itemType: "module", moduleType: "greenhouse" },
        inputs: { water: 5 },
        buildTicks: 10,
      },
    };
    const modules: ModuleIndex = {
      "supply-cache-1": {
        id: "supply-cache-1",
        blueprintId: "supply-cache",
        moduleType: "supply-cache",
        moduleLevel: null,
        displayName: "Supply Cache",
        connectedTo: [],
        runtimeAttributes: { status: "online" },
        capabilities: [],
      },
    };
    saveBlueprints(blueprints);
    saveModules(modules);

    const app = createServerApp();
    await app.request("http://localhost/inventory", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resourceType: "water", amount: 10 }),
    });

    const createResponse = await app.request("http://localhost/builds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blueprintId: "greenhouse", displayName: "Greenhouse Alpha" }),
    });
    expect(createResponse.status).toBe(200);
    const created = (await createResponse.json()) as { build: { id: string } };

    const cancelResponse = await app.request(`http://localhost/builds/${created.build.id}`, {
      method: "DELETE",
    });
    expect(cancelResponse.status).toBe(200);
    expect(((await cancelResponse.json()) as { reason: string }).reason).toBe("manually cancel");
  });

  test("runs a tick through the backend and persists results", async () => {
    const registration: LocalRegistration = {
      habitatId: "hab_123",
      habitatUuid: "uuid-123",
      displayName: "Artemis Ridge",
      baseUrl: "https://planet.turingguild.com",
      registeredAt: "2026-07-10T00:00:00.000Z",
    };
    const blueprints: BlueprintIndex = {
      greenhouse: {
        blueprintId: "greenhouse",
        displayName: "Greenhouse Blueprint",
        output: { itemType: "module", moduleType: "greenhouse" },
        runtimeAttributes: { status: "online" },
        capabilities: [],
      },
    };
    const modules: ModuleIndex = {
      command: {
        id: "command",
        blueprintId: "command-module",
        moduleType: "command-module",
        moduleLevel: null,
        displayName: "Command Module",
        connectedTo: [],
        runtimeAttributes: {
          status: "active",
          powerDrawKw: { offline: 0, online: 1, active: 2, damaged: 1 },
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
        runtimeAttributes: { status: "online", currentEnergyKwh: 5, energyStorageKwh: 10 },
        capabilities: [],
      },
    };
    const builds: BuildIndex = {
      "greenhouse-build-1": {
        id: "greenhouse-build-1",
        blueprintId: "greenhouse",
        displayName: "Greenhouse Alpha",
        moduleType: "greenhouse",
        status: "queued",
        requiredTicks: 1,
        remainingTicks: 1,
        startedAt: "2026-07-10T00:00:00.000Z",
        requiredFacility: null,
        consumedResources: {},
      },
    };
    saveRegistration(registration);
    saveBlueprints(blueprints);
    saveModules(modules);
    saveBuilds(builds);

    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("https://planet.turingguild.com/world/solar-irradiance");

      return new Response(
        JSON.stringify({
          solarIrradiance: {
            wPerM2: 0,
            condition: "night",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const app = createServerApp();
    const response = await app.request("http://localhost/ticks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tickCount: 1 }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      powerSummary: { tickCount: number };
      buildSummary: { completedBuilds: Array<{ moduleId: string }> };
    };
    expect(payload.powerSummary.tickCount).toBe(1);
    expect(payload.buildSummary.completedBuilds[0].moduleId).toBe("greenhouse-1");
  });
});
