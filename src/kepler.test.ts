import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  getOfficialBlueprint,
  scanWorldTiles,
  getWorldSolarIrradiance,
  listOfficialBlueprints,
  listOfficialResources,
} from "./kepler";

const originalFetch = globalThis.fetch;
const originalToken = process.env.KEPLER_PLANET_TOKEN;
const originalBaseUrl = process.env.KEPLER_BASE_URL;

describe("kepler blueprint catalog helpers", () => {
  beforeEach(() => {
    process.env.KEPLER_PLANET_TOKEN = "test-token";
    process.env.KEPLER_BASE_URL = "https://planet.turingguild.com/";
  });

  afterEach(() => {
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

  test("builds the list request without a version query", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("https://planet.turingguild.com/catalog/blueprints");

      return new Response(
        JSON.stringify({ catalogVersion: "2026-06-24", blueprints: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const response = await listOfficialBlueprints();

    expect(response.catalogVersion).toBe("2026-06-24");
    expect(response.blueprints).toEqual([]);
  });

  test("builds the list request with a version query", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        "https://planet.turingguild.com/catalog/blueprints?version=2026-06-24",
      );

      return new Response(
        JSON.stringify({ catalogVersion: "2026-06-24", blueprints: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    globalThis.fetch = fetchMock as typeof fetch;

    await listOfficialBlueprints("2026-06-24");
  });

  test("builds the show request without a version query", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        "https://planet.turingguild.com/catalog/blueprints/survey-rover",
      );

      return new Response(
        JSON.stringify({
          blueprint: {
            id: "blueprint_1",
            blueprintId: "survey-rover",
            displayName: "Survey Rover",
            description: "Scout nearby terrain",
            status: "published",
            output: {},
            inputs: {},
            buildTicks: 300,
            repeatable: true,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const response = await getOfficialBlueprint("survey-rover");

    expect(response.blueprint.blueprintId).toBe("survey-rover");
  });

  test("builds the show request with a version query", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        "https://planet.turingguild.com/catalog/blueprints/rover-bay-upgrade?version=2026-06-24",
      );

      return new Response(
        JSON.stringify({
          blueprint: {
            id: "blueprint_2",
            blueprintId: "rover-bay-upgrade",
            displayName: "Rover Bay Upgrade",
            description: "Improve rover servicing capacity",
            status: "published",
            output: {},
            inputs: {},
            buildTicks: 480,
            repeatable: false,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    globalThis.fetch = fetchMock as typeof fetch;

    await getOfficialBlueprint("rover-bay-upgrade", "2026-06-24");
  });

  test("reports a clean error when a blueprint is missing", async () => {
    const fetchMock = mock(async () => {
      return new Response("Blueprint not found", { status: 404, statusText: "Not Found" });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    await expect(getOfficialBlueprint("missing-blueprint")).rejects.toThrow(
      "Kepler request failed (404 Not Found): Blueprint not found",
    );
  });

  test("builds the resource list request without a version query", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("https://planet.turingguild.com/catalog/resources");

      return new Response(
        JSON.stringify({ catalogVersion: "2026-06-24", resources: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const response = await listOfficialResources();

    expect(response.catalogVersion).toBe("2026-06-24");
    expect(response.resources).toEqual([]);
  });

  test("builds the resource list request with a version query", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        "https://planet.turingguild.com/catalog/resources?version=2026-06-24",
      );

      return new Response(
        JSON.stringify({ catalogVersion: "2026-06-24", resources: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    globalThis.fetch = fetchMock as typeof fetch;

    await listOfficialResources("2026-06-24");
  });

  test("builds the solar status request", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("https://planet.turingguild.com/world/solar-irradiance");

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

    const response = await getWorldSolarIrradiance();

    expect(response.solarIrradiance).toEqual({
      wPerM2: 900,
      condition: "clear",
    });
  });

  test("builds the world scan request", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        "https://planet.turingguild.com/world/scan?habitatId=hab_123&x=3&y=-2&sensorStrength=60&radiusTiles=0",
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

    const response = await scanWorldTiles("hab_123", 3, -2, 60, 0);

    expect(response).toEqual({
      origin: { x: 3, y: -2 },
      results: [],
    });
  });
});
