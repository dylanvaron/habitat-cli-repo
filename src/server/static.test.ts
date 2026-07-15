import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServerApp } from "./app";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "../..");
const distRoot = path.join(workspaceRoot, "dist");

describe("static dashboard hosting", () => {
  beforeEach(() => {
    mkdirSync(path.join(distRoot, "assets"), { recursive: true });
    writeFileSync(
      path.join(distRoot, "index.html"),
      "<!doctype html><html><body><div id='root'>Habitat Dashboard</div></body></html>",
    );
    writeFileSync(path.join(distRoot, "assets", "app.js"), "console.log('habitat');");
  });

  afterEach(() => {
    rmSync(distRoot, { force: true, recursive: true });
  });

  test("serves the dashboard index for non-api routes", async () => {
    const app = createServerApp();
    const response = await app.request("http://localhost/");

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Habitat Dashboard");
  });

  test("serves static assets from dist", async () => {
    const app = createServerApp();
    const response = await app.request("http://localhost/assets/app.js");

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("console.log");
  });

  test("does not mask existing api routes", async () => {
    const app = createServerApp();
    const response = await app.request("http://localhost/registration");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      registration: null,
      localModulesCount: 0,
      queuedBuildsCount: 0,
    });
  });
});
