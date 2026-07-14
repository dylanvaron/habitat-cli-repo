import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { createServerApp } from "./app";
import { deleteAllLocalState, saveRegistration, type LocalRegistration } from "../state";

const originalFetch = globalThis.fetch;
const originalToken = process.env.KEPLER_PLANET_TOKEN;
const originalBaseUrl = process.env.KEPLER_BASE_URL;

const registration: LocalRegistration = {
  habitatId: "hab_123",
  habitatUuid: "uuid-123",
  displayName: "Artemis Ridge",
  baseUrl: "https://planet.turingguild.com",
  registeredAt: "2026-07-10T00:00:00.000Z",
};

describe("resource scan route", () => {
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

  test("requires an existing registration", async () => {
    const app = createServerApp();
    const response = await app.request(
      "http://localhost/scan?x=3&y=-2&sensorStrength=60&radiusTiles=0",
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "This CLI is not registered with Kepler yet.",
    });
  });

  test("validates query parameters before calling Kepler", async () => {
    saveRegistration(registration);
    const fetchMock = mock(async () => {
      throw new Error("Kepler should not be called for invalid requests.");
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const app = createServerApp();
    const response = await app.request(
      "http://localhost/scan?x=3&y=-2&sensorStrength=200&radiusTiles=0",
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "sensorStrength must be between 0 and 100.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("injects the saved habitat id and returns the Kepler scan response unchanged", async () => {
    saveRegistration(registration);

    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        "https://planet.turingguild.com/world/scan?habitatId=hab_123&x=3&y=-2&sensorStrength=60&radiusTiles=0",
      );

      return new Response(
        JSON.stringify({
          origin: { x: 3, y: -2 },
          results: [
            {
              x: 3,
              y: -2,
              probabilities: [
                { resourceType: "water-ice", probability: 0.72 },
              ],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const app = createServerApp();
    const response = await app.request(
      "http://localhost/scan?x=3&y=-2&sensorStrength=60&radiusTiles=0",
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      origin: { x: 3, y: -2 },
      results: [
        {
          x: 3,
          y: -2,
          probabilities: [
            { resourceType: "water-ice", probability: 0.72 },
          ],
        },
      ],
    });
  });
});
