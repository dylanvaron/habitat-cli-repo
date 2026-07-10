import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { createServerApp } from "./app";
import {
  deleteAllLocalState,
  loadModules,
  loadRegistration,
  resetStateDatabaseConnection,
} from "../state";

const originalFetch = globalThis.fetch;
const originalToken = process.env.KEPLER_PLANET_TOKEN;
const originalBaseUrl = process.env.KEPLER_BASE_URL;

describe("registration routes", () => {
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

  test("creates registration through the backend and hydrates local state", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://planet.turingguild.com/habitats/register");
      expect(init?.method).toBe("POST");

      return new Response(
        JSON.stringify({
          habitatId: "hab_123",
          starterModules: [
            {
              id: "kepler-1",
              blueprintId: "command-module",
              displayName: "Command Module",
              connectedTo: [],
              runtimeAttributes: { status: "active" },
              capabilities: ["habitat-command"],
            },
          ],
          blueprints: [
            {
              blueprintId: "command-module",
              displayName: "Command Module Blueprint",
              output: { moduleType: "command-module" },
              runtimeAttributes: { status: "idle" },
              capabilities: ["habitat-command"],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const app = createServerApp();
    const response = await app.request("http://localhost/registration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Artemis Ridge" }),
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      registration: { displayName: string; habitatId: string };
      hydratedModulesCount: number;
    };

    expect(payload.registration.displayName).toBe("Artemis Ridge");
    expect(payload.registration.habitatId).toBe("hab_123");
    expect(payload.hydratedModulesCount).toBe(1);
    expect(loadRegistration()?.displayName).toBe("Artemis Ridge");
    expect(Object.keys(loadModules())).toEqual(["command-module-1"]);
  });

  test("returns registration status with remote habitat details", async () => {
    const registerFetchMock = mock(async () => {
      return new Response(
        JSON.stringify({
          habitatId: "hab_123",
          starterModules: [],
          blueprints: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    globalThis.fetch = registerFetchMock as typeof fetch;

    const app = createServerApp();
    await app.request("http://localhost/registration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Artemis Ridge" }),
    });

    const statusFetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("https://planet.turingguild.com/habitats/hab_123/registration");

      return new Response(
        JSON.stringify({
          habitat: {
            id: "hab_123",
            habitatSlug: "artemis-ridge",
            displayName: "Artemis Ridge",
            catalogVersion: "2026-07-10",
            status: "active",
            lastSeenAt: "2026-07-10T12:00:00.000Z",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    globalThis.fetch = statusFetchMock as typeof fetch;

    const response = await app.request("http://localhost/registration");
    const payload = (await response.json()) as {
      registration: { habitatId: string };
      remoteHabitat: { id: string; displayName: string };
      localModulesCount: number;
      queuedBuildsCount: number;
    };

    expect(response.status).toBe(200);
    expect(payload.registration.habitatId).toBe("hab_123");
    expect(payload.remoteHabitat.id).toBe("hab_123");
    expect(payload.remoteHabitat.displayName).toBe("Artemis Ridge");
    expect(payload.localModulesCount).toBe(0);
    expect(payload.queuedBuildsCount).toBe(0);
  });

  test("keeps registration after resetting the server state connection", async () => {
    const registerFetchMock = mock(async () => {
      return new Response(
        JSON.stringify({
          habitatId: "hab_123",
          starterModules: [],
          blueprints: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    globalThis.fetch = registerFetchMock as typeof fetch;

    const firstApp = createServerApp();
    const registerResponse = await firstApp.request("http://localhost/registration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Artemis Ridge" }),
    });

    expect(registerResponse.status).toBe(200);
    expect(loadRegistration()?.displayName).toBe("Artemis Ridge");

    resetStateDatabaseConnection();

    const statusFetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("https://planet.turingguild.com/habitats/hab_123/registration");

      return new Response(
        JSON.stringify({
          habitat: {
            id: "hab_123",
            habitatSlug: "artemis-ridge",
            displayName: "Artemis Ridge",
            catalogVersion: "2026-07-10",
            status: "active",
            lastSeenAt: "2026-07-10T12:00:00.000Z",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    globalThis.fetch = statusFetchMock as typeof fetch;

    const secondApp = createServerApp();
    const response = await secondApp.request("http://localhost/registration");
    const payload = (await response.json()) as {
      registration: { habitatId: string; displayName: string };
      remoteHabitat: { id: string; displayName: string };
    };

    expect(response.status).toBe(200);
    expect(payload.registration.habitatId).toBe("hab_123");
    expect(payload.registration.displayName).toBe("Artemis Ridge");
    expect(payload.remoteHabitat.id).toBe("hab_123");
    expect(payload.remoteHabitat.displayName).toBe("Artemis Ridge");
  });
});
