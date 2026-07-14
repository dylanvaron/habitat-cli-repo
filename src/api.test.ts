import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  addInventoryResource,
  cancelBuild,
  createBuild,
  createModule,
  getCatalogBlueprint,
  getBuild,
  getInventory,
  getModule,
  getSolarStatus,
  listBuilds,
  listModules,
  createRegistration,
  deleteModule,
  deleteRegistration,
  getHabitatApiBaseUrl,
  getRegistrationStatus,
  habitatApiRequest,
  listCatalogBlueprints,
  listCatalogResources,
  runTick,
  scanResources,
  setModuleStatus,
  updateModule,
} from "./api";

const originalFetch = globalThis.fetch;
const originalBaseUrl = process.env.HABITAT_API_BASE_URL;

beforeEach(() => {
  delete process.env.HABITAT_API_BASE_URL;
});

afterEach(() => {
  globalThis.fetch = originalFetch;

  if (originalBaseUrl === undefined) {
    delete process.env.HABITAT_API_BASE_URL;
  } else {
    process.env.HABITAT_API_BASE_URL = originalBaseUrl;
  }
});

describe("habitat api client", () => {
  test("defaults to the local backend url", () => {
    delete process.env.HABITAT_API_BASE_URL;

    expect(getHabitatApiBaseUrl()).toBe("http://127.0.0.1:8787");
  });

  test("trims trailing slashes from the configured base url", () => {
    process.env.HABITAT_API_BASE_URL = "http://localhost:4000///";

    expect(getHabitatApiBaseUrl()).toBe("http://localhost:4000");
  });

  test("sends json requests and parses json responses", async () => {
    process.env.HABITAT_API_BASE_URL = "http://127.0.0.1:8787/";

    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://127.0.0.1:8787/modules");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual({
        "Content-Type": "application/json",
        Accept: "application/json",
      });
      expect(init?.body).toBe(JSON.stringify({ displayName: "Greenhouse Alpha" }));

      return new Response(
        JSON.stringify({ module: { id: "greenhouse-1", displayName: "Greenhouse Alpha" } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const response = await habitatApiRequest<{ module: { id: string; displayName: string } }>(
      "POST",
      "/modules",
      { displayName: "Greenhouse Alpha" },
    );

    expect(response).toEqual({
      module: { id: "greenhouse-1", displayName: "Greenhouse Alpha" },
    });
  });

  test("returns undefined for 204 responses", async () => {
    const fetchMock = mock(async () => {
      return new Response(null, { status: 204 });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const response = await habitatApiRequest<void>("DELETE", "/registration");

    expect(response).toBeUndefined();
  });

  test("turns backend json errors into friendly cli errors", async () => {
    const fetchMock = mock(async () => {
      return new Response(JSON.stringify({ error: "No local module named \"alpha\" was found." }), {
        status: 404,
        statusText: "Not Found",
        headers: { "Content-Type": "application/json" },
      });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    await expect(habitatApiRequest("GET", "/modules/alpha")).rejects.toThrow(
      'Habitat API request failed: No local module named "alpha" was found.',
    );
  });

  test("falls back to plain text backend errors", async () => {
    const fetchMock = mock(async () => {
      return new Response("Backend unavailable", {
        status: 503,
        statusText: "Service Unavailable",
        headers: { "Content-Type": "text/plain" },
      });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    await expect(habitatApiRequest("GET", "/health")).rejects.toThrow(
      "Habitat API request failed: Backend unavailable",
    );
  });

  test("builds the registration status request", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("http://127.0.0.1:8787/registration");

      return new Response(
        JSON.stringify({
          registration: null,
          localModulesCount: 0,
          queuedBuildsCount: 0,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const response = await getRegistrationStatus();

    expect(response.registration).toBeNull();
    expect(response.localModulesCount).toBe(0);
    expect(response.queuedBuildsCount).toBe(0);
  });

  test("builds the registration create request", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://127.0.0.1:8787/registration");
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe(JSON.stringify({ displayName: "Artemis Ridge" }));

      return new Response(
        JSON.stringify({
          registration: {
            habitatId: "hab_123",
            habitatUuid: "uuid-123",
            displayName: "Artemis Ridge",
            baseUrl: "https://planet.turingguild.com",
            registeredAt: "2026-07-10T00:00:00.000Z",
          },
          hydratedModulesCount: 3,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const response = await createRegistration("Artemis Ridge");

    expect(response.registration.displayName).toBe("Artemis Ridge");
    expect(response.hydratedModulesCount).toBe(3);
  });

  test("builds the registration delete request", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://127.0.0.1:8787/registration");
      expect(init?.method).toBe("DELETE");

      return new Response(JSON.stringify({ displayName: "Artemis Ridge" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const response = await deleteRegistration();

    expect(response.displayName).toBe("Artemis Ridge");
  });

  test("builds the catalog blueprint list request", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("http://127.0.0.1:8787/catalog/blueprints?version=2026-07-10");

      return new Response(
        JSON.stringify({ catalogVersion: "2026-07-10", blueprints: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const response = await listCatalogBlueprints("2026-07-10");

    expect(response.catalogVersion).toBe("2026-07-10");
  });

  test("builds the catalog blueprint show request", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("http://127.0.0.1:8787/catalog/blueprints/greenhouse");

      return new Response(
        JSON.stringify({
          blueprint: {
            blueprintId: "greenhouse",
            displayName: "Greenhouse",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const response = await getCatalogBlueprint("greenhouse");

    expect(response.blueprint.blueprintId).toBe("greenhouse");
  });

  test("builds the catalog resource list request", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("http://127.0.0.1:8787/catalog/resources");

      return new Response(
        JSON.stringify({ catalogVersion: "2026-07-10", resources: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const response = await listCatalogResources();

    expect(response.catalogVersion).toBe("2026-07-10");
  });

  test("builds the solar status request", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("http://127.0.0.1:8787/solar");

      return new Response(
        JSON.stringify({
          solarIrradiance: {
            wPerM2: 900,
            condition: "clear",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const response = await getSolarStatus();

    expect(response.solarIrradiance.condition).toBe("clear");
  });

  test("builds the resource scan request", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        "http://127.0.0.1:8787/scan?x=3&y=-2&sensorStrength=60&radiusTiles=0",
      );

      return new Response(
        JSON.stringify({
          origin: { x: 3, y: -2 },
          results: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const response = await scanResources({
      x: 3,
      y: -2,
      sensorStrength: 60,
    });

    expect(response).toEqual({
      origin: { x: 3, y: -2 },
      results: [],
    });
  });

  test("builds the module list request", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("http://127.0.0.1:8787/modules");

      return new Response(JSON.stringify({ modules: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const response = await listModules();

    expect(response.modules).toEqual([]);
  });

  test("builds the module show request", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("http://127.0.0.1:8787/modules/alpha");

      return new Response(
        JSON.stringify({ module: { id: "alpha", displayName: "Alpha", connectedTo: [], runtimeAttributes: {}, capabilities: [] } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const response = await getModule("alpha");

    expect(response.module.id).toBe("alpha");
  });

  test("builds the module create request", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://127.0.0.1:8787/modules");
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe(JSON.stringify({ blueprintId: "greenhouse", displayName: "Greenhouse Alpha" }));

      return new Response(
        JSON.stringify({ module: { id: "greenhouse-1", displayName: "Greenhouse Alpha", connectedTo: [], runtimeAttributes: {}, capabilities: [] } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const response = await createModule("greenhouse", "Greenhouse Alpha");

    expect(response.module.id).toBe("greenhouse-1");
  });

  test("builds the module update request", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://127.0.0.1:8787/modules/alpha");
      expect(init?.method).toBe("PATCH");
      expect(init?.body).toBe(JSON.stringify({ displayName: "Alpha Prime", runtimeAttributes: { health: 90 } }));

      return new Response(
        JSON.stringify({ module: { id: "alpha", displayName: "Alpha Prime", connectedTo: [], runtimeAttributes: { health: 90 }, capabilities: [] } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const response = await updateModule("alpha", {
      displayName: "Alpha Prime",
      runtimeAttributes: { health: 90 },
    });

    expect(response.module.displayName).toBe("Alpha Prime");
  });

  test("builds the module status request", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://127.0.0.1:8787/modules/alpha");
      expect(init?.method).toBe("PATCH");
      expect(init?.body).toBe(JSON.stringify({ status: "active" }));

      return new Response(
        JSON.stringify({ module: { id: "alpha", displayName: "Alpha", connectedTo: [], runtimeAttributes: { status: "active" }, capabilities: [] } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const response = await setModuleStatus("alpha", "active");

    expect(response.module.runtimeAttributes.status).toBe("active");
  });

  test("builds the module delete request", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://127.0.0.1:8787/modules/alpha");
      expect(init?.method).toBe("DELETE");

      return new Response(null, { status: 204 });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    await expect(deleteModule("alpha")).resolves.toBeUndefined();
  });

  test("builds the inventory read request", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("http://127.0.0.1:8787/inventory");

      return new Response(JSON.stringify({ inventory: { water: 50 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const response = await getInventory();

    expect(response.inventory.water).toBe(50);
  });

  test("builds the inventory update request", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://127.0.0.1:8787/inventory");
      expect(init?.method).toBe("PATCH");
      expect(init?.body).toBe(JSON.stringify({ resourceType: "water", amount: 50 }));

      return new Response(JSON.stringify({ inventory: { water: 50 }, resourceType: "water", amount: 50 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const response = await addInventoryResource("water", 50);

    expect(response.inventory.water).toBe(50);
  });

  test("builds the build list request", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("http://127.0.0.1:8787/builds");

      return new Response(JSON.stringify({ builds: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const response = await listBuilds();

    expect(response.builds).toEqual([]);
  });

  test("builds the build show request", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("http://127.0.0.1:8787/builds/greenhouse-build-1");

      return new Response(
        JSON.stringify({ build: { id: "greenhouse-build-1", displayName: "Greenhouse Alpha" } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const response = await getBuild("greenhouse-build-1");

    expect(response.build.id).toBe("greenhouse-build-1");
  });

  test("builds the build create request", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://127.0.0.1:8787/builds");
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe(
        JSON.stringify({ blueprintId: "greenhouse", displayName: "Greenhouse Alpha", dryRun: true }),
      );

      return new Response(
        JSON.stringify({
          build: { id: "greenhouse-build-1", blueprintId: "greenhouse", displayName: "Greenhouse Alpha", consumedResources: {} },
          assignedFacilityModuleId: null,
          inventory: {},
          dryRun: true,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const response = await createBuild("greenhouse", "Greenhouse Alpha", true);

    expect(response.build.id).toBe("greenhouse-build-1");
    expect(response.dryRun).toBe(true);
  });

  test("builds the build cancel request", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://127.0.0.1:8787/builds/greenhouse-build-1");
      expect(init?.method).toBe("DELETE");

      return new Response(
        JSON.stringify({
          canceledBuild: { id: "greenhouse-build-1", displayName: "Greenhouse Alpha" },
          reason: "manually cancel",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const response = await cancelBuild("greenhouse-build-1");

    expect(response.reason).toBe("manually cancel");
  });

  test("builds the tick request", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://127.0.0.1:8787/ticks");
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe(JSON.stringify({ tickCount: 1 }));

      return new Response(
        JSON.stringify({
          powerSummary: { tickCount: 1, solar: { arraysUsed: [] } },
          buildSummary: { advancedBuilds: 0, completedBuilds: [], canceledBuilds: [] },
          canceledBuilds: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const response = await runTick(1);

    expect(response.powerSummary.tickCount).toBe(1);
  });
});
