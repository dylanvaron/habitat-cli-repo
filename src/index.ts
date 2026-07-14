#!/usr/bin/env bun

import { Command } from "commander";
import packageJson from "../package.json";
import { loadProjectEnv } from "./env";
import { registerCatalogCommands } from "./commands/catalog";
import { registerConstructCommands } from "./commands/construct";
import { registerHabitatCommands } from "./commands/habitat";
import { registerModuleCommands } from "./commands/module";
import { registerResourceCommands } from "./commands/resource";
import { registerScanCommands } from "./commands/scan";
import { registerSolarCommands } from "./commands/solar";
import { getHabitatDatabasePath } from "./state";

loadProjectEnv();

const program = new Command();

program
  .name("habitat")
  .description("Register this Habitat CLI with Kepler and inspect its registration state.")
  .version(packageJson.version)
  .showHelpAfterError()
  .addHelpText(
    "after",
    `
Examples:
  habitat register --name "Artemis Ridge"
  habitat status
  habitat tick 1
  habitat catalog blueprints list
  habitat solar status
  habitat resource list
  habitat resource give water 50
  habitat construct --blueprint-id greenhouse --name "Greenhouse Alpha"
  habitat unregister
  habitat module list

Notes:
  Local state is stored in ${getHabitatDatabasePath()}.
  The CLI reads auth from KEPLER_PLANET_TOKEN, KEPLER_WORLD_TOKEN, or PLANET_TOKEN.
  The CLI reads the base URL from KEPLER_BASE_URL, KEPLER_WORLD_BASE_URL, or PLANET_SERVER_PUBLIC_BASE_URL.
`,
  );

registerHabitatCommands(program);
registerCatalogCommands(program);
registerConstructCommands(program);
registerResourceCommands(program);
registerScanCommands(program);
registerSolarCommands(program);
registerModuleCommands(program);

program.action(() => {
  program.outputHelp();
});

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
