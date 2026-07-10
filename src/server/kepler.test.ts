import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { createServerApp } from "./app";

const originalFetch = globalThis.fetch;
const originalToken = process.env.KEPLER_PLANET_TOKEN;
const originalBaseUrl = process.env.KEPLER_BASE_URL;

describe("kepler proxy routes", () => {
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

  test("proxies blueprint list through the backend", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        "https://planet.turingguild.com/catalog/blueprints?version=2026-07-10",
      );

      return new Response(
        JSON.stringify({ catalogVersion: "2026-07-10", blueprints: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const app = createServerApp();
    const response = await app.request(
      "http://localhost/catalog/blueprints?version=2026-07-10",
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      catalogVersion: "2026-07-10",
      blueprints: [],
    });
  });

  test("proxies resource list through the backend", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("https://planet.turingguild.com/catalog/resources");

      return new Response(
        JSON.stringify({ catalogVersion: "2026-07-10", resources: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const app = createServerApp();
    const response = await app.request("http://localhost/catalog/resources");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      catalogVersion: "2026-07-10",
      resources: [],
    });
  });

  test("proxies solar status through the backend", async () => {
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

    const app = createServerApp();
    const response = await app.request("http://localhost/solar");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      solarIrradiance: {
        wPerM2: 900,
        condition: "clear",
      },
    });
  });
});
