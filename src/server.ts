import { createServerApp } from "./server/app";
import { loadProjectEnv } from "./env";
import { logEvent } from "./logging";
import { getHabitatDatabasePath, loadRegistration } from "./state";

loadProjectEnv();

export function getHabitatApiPort(): number {
  const rawPort = process.env.HABITAT_API_PORT ?? "8787";
  const port = Number(rawPort);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid HABITAT_API_PORT value "${rawPort}".`);
  }

  return port;
}

export function startHabitatApiServer(): void {
  const port = getHabitatApiPort();
  const hostname = "0.0.0.0";
  const app = createServerApp();

  Bun.serve({
    hostname,
    port,
    fetch: app.fetch,
  });

  console.log(`Habitat backend listening on http://${hostname}:${port}`);
  logEvent("habitat-api", `state db -> ${getHabitatDatabasePath()}`);

  const registration = loadRegistration();
  logEvent(
    "habitat-api",
    `startup -> ${registration ? `registered ${registration.displayName}` : "not registered"}`,
  );
}

if (import.meta.main) {
  startHabitatApiServer();
}
