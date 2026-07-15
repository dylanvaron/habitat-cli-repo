import { render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import App from "./App";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type MockRouteMap = Record<string, Response | (() => Response | Promise<Response>)>;

function installFetchMock(routes: MockRouteMap): void {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const url = typeof input === "string" ? input : String(input);
    const pathname = new URL(url, "http://localhost").pathname;
    const key = `${method} ${pathname}`;
    const handler = routes[key];

    if (!handler) {
      throw new Error(`Unhandled request: ${key}`);
    }

    if (typeof handler === "function") {
      return await handler();
    }

    return handler.clone();
  }) as typeof fetch;
}

describe("Habitat dashboard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("shows the unregistered state and submits registration", async () => {
    let registrationFetchCount = 0;

    installFetchMock({
      "GET /health": jsonResponse({ ok: true, service: "habitat-backend" }),
      "GET /registration": () => {
        registrationFetchCount += 1;

        if (registrationFetchCount === 1) {
          return jsonResponse({
            registration: null,
            localModulesCount: 0,
            queuedBuildsCount: 0,
          });
        }

        return jsonResponse({
          registration: {
            habitatId: "hab_123",
            habitatUuid: "uuid_123",
            displayName: "Artemis Ridge",
            baseUrl: "https://planet.turingguild.com",
            registeredAt: "2026-07-15T00:00:00.000Z",
          },
          localModulesCount: 3,
          queuedBuildsCount: 0,
        });
      },
      "GET /modules": jsonResponse({ modules: [] }),
      "GET /solar": jsonResponse({ solarIrradiance: { wPerM2: 420, condition: "dusty" } }),
      "POST /registration": jsonResponse({
        registration: {
          habitatId: "hab_123",
          habitatUuid: "uuid_123",
          displayName: "Artemis Ridge",
          baseUrl: "https://planet.turingguild.com",
          registeredAt: "2026-07-15T00:00:00.000Z",
        },
        hydratedModulesCount: 3,
      }),
    });

    const view = render(<App />);

    expect(await view.findByText("Habitat identity")).not.toBeNull();
    await userEvent.type(view.getByPlaceholderText("Artemis Ridge"), "Artemis Ridge");
    await userEvent.click(view.getByRole("button", { name: "Register habitat" }));

    expect(await view.findByText("Kepler linked")).not.toBeNull();
    expect(view.getAllByText("Artemis Ridge").length).toBeGreaterThan(0);
  });

  test("requires confirmation before unregistering", async () => {
    installFetchMock({
      "GET /health": jsonResponse({ ok: true, service: "habitat-backend" }),
      "GET /registration": jsonResponse({
        registration: {
          habitatId: "hab_123",
          habitatUuid: "uuid_123",
          displayName: "Artemis Ridge",
          baseUrl: "https://planet.turingguild.com",
          registeredAt: "2026-07-15T00:00:00.000Z",
        },
        localModulesCount: 2,
        queuedBuildsCount: 0,
      }),
      "GET /modules": jsonResponse({ modules: [] }),
      "GET /solar": jsonResponse({ solarIrradiance: { wPerM2: 900, condition: "clear" } }),
      "DELETE /registration": jsonResponse({ displayName: "Artemis Ridge" }),
    });

    const view = render(<App />);

    expect(await view.findByText("Unregister habitat")).not.toBeNull();
    await userEvent.click(view.getByRole("button", { name: "Unregister habitat" }));

    const confirmButton = view.getByRole("button", { name: "Confirm unregister" }) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);

    await userEvent.type(view.getByLabelText("Type habitat name"), "Artemis Ridge");
    await waitFor(() => {
      expect(confirmButton.disabled).toBe(false);
    });
  });

  test("runs preset and custom ticks with validation", async () => {
    let tickCalls = 0;

    installFetchMock({
      "GET /health": jsonResponse({ ok: true, service: "habitat-backend" }),
      "GET /registration": jsonResponse({
        registration: {
          habitatId: "hab_123",
          habitatUuid: "uuid_123",
          displayName: "Artemis Ridge",
          baseUrl: "https://planet.turingguild.com",
          registeredAt: "2026-07-15T00:00:00.000Z",
        },
        localModulesCount: 2,
        queuedBuildsCount: 0,
      }),
      "GET /modules": jsonResponse({
        modules: [
          {
            id: "battery-a",
            blueprintId: "basic-battery",
            moduleType: "basic-battery",
            moduleLevel: null,
            displayName: "Battery A",
            connectedTo: [],
            runtimeAttributes: {
              status: "online",
              currentEnergyKwh: 5,
              energyStorageKwh: 10,
            },
            capabilities: [],
          },
        ],
      }),
      "GET /solar": jsonResponse({ solarIrradiance: { wPerM2: 900, condition: "clear" } }),
      "POST /ticks": () => {
        tickCalls += 1;

        return jsonResponse({
          powerSummary: {
            tickCount: tickCalls === 1 ? 1 : 120,
            averagePowerDrawKw: 1.5,
            totalEnergyDemandKwh: 0.4,
            totalEnergyDrainedKwh: 0.4,
            energyShortfallKwh: 0,
            batteriesUsed: [],
            forcedOfflineModuleIds: [],
            solar: {
              irradianceWPerM2: 900,
              totalGeneratedEnergyKwh: 0.6,
              discardedEnergyKwh: 0.1,
              arraysUsed: [],
            },
          },
          buildSummary: {
            tickCount: tickCalls === 1 ? 1 : 120,
            advancedBuilds: 0,
            completedBuilds: [],
            canceledBuilds: [],
          },
          canceledBuilds: [],
        });
      },
    });

    const view = render(<App />);

    expect(await view.findByText("Advance the simulation")).not.toBeNull();
    await userEvent.click(view.getByRole("button", { name: /1 Tick.*Immediate step/ }));
    expect(await view.findByText("Net Energy")).not.toBeNull();

    const input = view.getByLabelText("Custom tick count");
    await userEvent.clear(input);
    await userEvent.type(input, "bad");
    await userEvent.click(view.getByRole("button", { name: "Run custom tick" }));
    expect(await view.findByText("Enter a positive whole-number tick value.")).not.toBeNull();

    await userEvent.clear(input);
    await userEvent.type(input, "120");
    await userEvent.click(view.getByRole("button", { name: "Run custom tick" }));

    await waitFor(() => {
      expect(view.getByText("120 ticks")).not.toBeNull();
    });
  });

  test("shows the empty tick state before any tick runs", async () => {
    installFetchMock({
      "GET /health": jsonResponse({ ok: true, service: "habitat-backend" }),
      "GET /registration": jsonResponse({
        registration: {
          habitatId: "hab_123",
          habitatUuid: "uuid_123",
          displayName: "Artemis Ridge",
          baseUrl: "https://planet.turingguild.com",
          registeredAt: "2026-07-15T00:00:00.000Z",
        },
        localModulesCount: 1,
        queuedBuildsCount: 0,
      }),
      "GET /modules": jsonResponse({ modules: [] }),
      "GET /solar": jsonResponse({ solarIrradiance: { wPerM2: 0, condition: "night" } }),
    });

    const view = render(<App />);

    expect(await view.findByText("No tick-derived power summary yet.")).not.toBeNull();
  });

  test("shows api errors and allows retry", async () => {
    let shouldFail = true;

    installFetchMock({
      "GET /health": () => {
        if (shouldFail) {
          return jsonResponse({ error: "Backend unavailable" }, 502);
        }

        return jsonResponse({ ok: true, service: "habitat-backend" });
      },
      "GET /registration": jsonResponse({
        registration: null,
        localModulesCount: 0,
        queuedBuildsCount: 0,
      }),
      "GET /modules": jsonResponse({ modules: [] }),
      "GET /solar": jsonResponse({ solarIrradiance: { wPerM2: 0, condition: "night" } }),
    });

    const view = render(<App />);

    expect(await view.findByText("Unable to load the Habitat dashboard")).not.toBeNull();

    shouldFail = false;
    await userEvent.click(view.getByRole("button", { name: "Retry connection" }));

    expect(await view.findByText("Register habitat")).not.toBeNull();
  });

  test("toggles between light and dark mode", async () => {
    installFetchMock({
      "GET /health": jsonResponse({ ok: true, service: "habitat-backend" }),
      "GET /registration": jsonResponse({
        registration: null,
        localModulesCount: 0,
        queuedBuildsCount: 0,
      }),
      "GET /modules": jsonResponse({ modules: [] }),
      "GET /solar": jsonResponse({ solarIrradiance: { wPerM2: 0, condition: "night" } }),
    });

    const view = render(<App />);

    expect(await view.findByRole("button", { name: "Dark mode" })).not.toBeNull();
    await userEvent.click(view.getByRole("button", { name: "Dark mode" }));

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("dark");
      expect(window.localStorage.getItem("habitat-theme")).toBe("dark");
      expect(view.getByRole("button", { name: "Light mode" })).not.toBeNull();
    });
  });

  test("lists modules and allows toggling a module offline and active", async () => {
    let moduleFetchCount = 0;
    const patchStatuses: string[] = [];

    installFetchMock({
      "GET /health": jsonResponse({ ok: true, service: "habitat-backend" }),
      "GET /registration": jsonResponse({
        registration: {
          habitatId: "hab_123",
          habitatUuid: "uuid_123",
          displayName: "Artemis Ridge",
          baseUrl: "https://planet.turingguild.com",
          registeredAt: "2026-07-15T00:00:00.000Z",
        },
        localModulesCount: 1,
        queuedBuildsCount: 0,
      }),
      "GET /modules": () => {
        moduleFetchCount += 1;

        const status =
          moduleFetchCount === 1 ? "online" : moduleFetchCount === 2 ? "offline" : "active";

        return jsonResponse({
          modules: [
            {
              id: "command-1",
              blueprintId: "command-module",
              moduleType: "command-module",
              moduleLevel: null,
              displayName: "Command Module",
              connectedTo: [],
              runtimeAttributes: {
                status,
                powerDrawKw: { offline: 0, online: 1.2, active: 2.1 },
              },
              capabilities: [],
            },
            {
              id: "solar-1",
              blueprintId: "small-solar-array",
              moduleType: "small-solar-array",
              moduleLevel: null,
              displayName: "Solar Array",
              connectedTo: [],
              runtimeAttributes: {
                status: "online",
                powerGenerationKw: 2.4,
              },
              capabilities: [],
            },
          ],
        });
      },
      "GET /solar": jsonResponse({ solarIrradiance: { wPerM2: 500, condition: "dusty" } }),
      "PATCH /modules/command-1": jsonResponse({
        module: {
          id: "command-1",
          blueprintId: "command-module",
          moduleType: "command-module",
          moduleLevel: null,
          displayName: "Command Module",
          connectedTo: [],
          runtimeAttributes: {
            status: "offline",
            powerDrawKw: { offline: 0, online: 1.2, active: 2.1 },
          },
          capabilities: [],
        },
        powerDrawKw: 0,
      }),
    });

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const url = typeof input === "string" ? input : String(input);
      const pathname = new URL(url, "http://localhost").pathname;
      const key = `${method} ${pathname}`;

      if (key === "PATCH /modules/command-1") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { status?: string };
        patchStatuses.push(body.status ?? "");

        return jsonResponse({
          module: {
            id: "command-1",
            blueprintId: "command-module",
            moduleType: "command-module",
            moduleLevel: null,
            displayName: "Command Module",
            connectedTo: [],
            runtimeAttributes: {
              status: body.status ?? "offline",
              powerDrawKw: { offline: 0, online: 1.2, active: 2.1 },
            },
            capabilities: [],
          },
          powerDrawKw: body.status === "active" ? 2.1 : body.status === "online" ? 1.2 : 0,
        });
      }

      const routes: MockRouteMap = {
        "GET /health": jsonResponse({ ok: true, service: "habitat-backend" }),
        "GET /registration": jsonResponse({
          registration: {
            habitatId: "hab_123",
            habitatUuid: "uuid_123",
            displayName: "Artemis Ridge",
            baseUrl: "https://planet.turingguild.com",
            registeredAt: "2026-07-15T00:00:00.000Z",
          },
          localModulesCount: 1,
          queuedBuildsCount: 0,
        }),
        "GET /modules": (() => {
          moduleFetchCount += 1;

          const status =
            moduleFetchCount === 1 ? "online" : moduleFetchCount === 2 ? "offline" : "active";

          return jsonResponse({
            modules: [
              {
                id: "command-1",
                blueprintId: "command-module",
                moduleType: "command-module",
                moduleLevel: null,
                displayName: "Command Module",
                connectedTo: [],
                runtimeAttributes: {
                  status,
                  powerDrawKw: { offline: 0, online: 1.2, active: 2.1 },
                },
                capabilities: [],
              },
              {
                id: "solar-1",
                blueprintId: "small-solar-array",
                moduleType: "small-solar-array",
                moduleLevel: null,
                displayName: "Solar Array",
                connectedTo: [],
                runtimeAttributes: {
                  status: "online",
                  powerGenerationKw: 2.4,
                },
                capabilities: [],
              },
            ],
          });
        }) as unknown as Response,
        "GET /solar": jsonResponse({ solarIrradiance: { wPerM2: 500, condition: "dusty" } }),
      };

      const handler = routes[key];
      if (!handler) {
        throw new Error(`Unhandled request: ${key}`);
      }

      return typeof handler === "function" ? await handler() : handler.clone();
    }) as typeof fetch;

    const view = render(<App />);

    expect(await view.findByText("Current modules, status, and power usage")).not.toBeNull();
    expect(view.getByText("1.20 kW draw")).not.toBeNull();
    expect(view.getByText("2.40 kW")).not.toBeNull();
    await userEvent.click(view.getByRole("button", { name: "offline" }));

    await waitFor(() => {
      expect(view.getAllByText("offline").length).toBeGreaterThan(0);
      expect(view.getByText("0.00 kW draw")).not.toBeNull();
    });

    await userEvent.click(view.getByRole("button", { name: "active" }));

    await waitFor(() => {
      expect(view.getAllByText("active").length).toBeGreaterThan(0);
      expect(view.getByText("2.10 kW draw")).not.toBeNull();
    });

    expect(patchStatuses).toEqual(["offline", "active"]);
  });
});
