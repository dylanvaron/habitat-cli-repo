import { createServerApp } from "./server/app";
import { logEvent } from "./logging";
import { getHabitatDirPath, loadRegistration } from "./state";

const port = Number(process.env.PORT ?? "3000");
const hostname = "127.0.0.1";

if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`Invalid PORT value "${process.env.PORT}".`);
}

const app = createServerApp();

Bun.serve({
  hostname,
  port,
  fetch: app.fetch,
});

console.log(`Habitat backend listening on http://${hostname}:${port}`);
logEvent("habitat-api", `state dir -> ${getHabitatDirPath()}`);

const registration = loadRegistration();
logEvent(
  "habitat-api",
  `startup -> ${registration ? `registered ${registration.displayName}` : "not registered"}`,
);
