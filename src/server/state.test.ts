import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createServerApp } from "./app";
import {
  deleteAllLocalState,
  saveBlueprints,
  saveModules,
  type BlueprintIndex,
  type ModuleIndex,
} from "../state";

describe("local state routes", () => {
  beforeEach(() => {
    deleteAllLocalState();
  });

  afterEach(() => {
    deleteAllLocalState();
  });

  test("creates, updates, lists, and deletes modules through the backend", async () => {
    const app = createServerApp();
    const blueprints: BlueprintIndex = {
      greenhouse: {
        blueprintId: "greenhouse",
        displayName: "Greenhouse Blueprint",
        output: { moduleType: "greenhouse" },
        runtimeAttributes: { status: "online", health: 100 },
        capabilities: ["food-production"],
      },
    };
    saveBlueprints(blueprints);

    const createResponse = await app.request("http://localhost/modules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blueprintId: "greenhouse", displayName: "Greenhouse Alpha" }),
    });
    expect(createResponse.status).toBe(200);
    const created = (await createResponse.json()) as { module: { id: string; displayName: string } };
    expect(created.module.id).toBe("greenhouse-1");

    const patchResponse = await app.request(`http://localhost/modules/${created.module.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: "Greenhouse Prime",
        status: "active",
        runtimeAttributes: { health: 95 },
      }),
    });
    expect(patchResponse.status).toBe(200);
    const updated = (await patchResponse.json()) as {
      module: { displayName: string; runtimeAttributes: { status: string; health: number } };
    };
    expect(updated.module.displayName).toBe("Greenhouse Prime");
    expect(updated.module.runtimeAttributes.status).toBe("active");
    expect(updated.module.runtimeAttributes.health).toBe(95);

    const listResponse = await app.request("http://localhost/modules");
    const listed = (await listResponse.json()) as { modules: Array<{ id: string }> };
    expect(listed.modules.map((moduleRecord) => moduleRecord.id)).toEqual(["greenhouse-1"]);

    const deleteResponse = await app.request(`http://localhost/modules/${created.module.id}`, {
      method: "DELETE",
    });
    expect(deleteResponse.status).toBe(204);
  });

  test("reads and updates inventory through the backend", async () => {
    const app = createServerApp();

    const updateResponse = await app.request("http://localhost/inventory", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resourceType: "water", amount: 50 }),
    });
    expect(updateResponse.status).toBe(200);
    const updated = (await updateResponse.json()) as { inventory: { water: number } };
    expect(updated.inventory.water).toBe(50);

    const readResponse = await app.request("http://localhost/inventory");
    const inventory = (await readResponse.json()) as { inventory: { water: number } };
    expect(inventory.inventory.water).toBe(50);
  });

  test("reports missing modules through the backend", async () => {
    const app = createServerApp();
    const response = await app.request("http://localhost/modules/missing");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Module not found." });
  });
});
