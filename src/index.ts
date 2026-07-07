#!/usr/bin/env bun

import { Command } from "commander";
import packageJson from "../package.json";
import {
  createLocalModule,
  deleteAllLocalState,
  disconnectDeletedModule,
  getHabitatDirPath,
  hydrateModulesFromStarterModules,
  indexBlueprints,
  loadBlueprints,
  loadModules,
  loadRegistration,
  parseRuntimeAssignment,
  saveBlueprints,
  saveModules,
  saveRegistration,
  type HabitatRecord,
  type HabitatResponse,
  type LocalModule,
  type LocalRegistration,
  type ModuleIndex,
  type RegistrationResponse,
} from "./state";

function getBaseUrl(): string {
  const rawBaseUrl =
    process.env.KEPLER_BASE_URL ??
    process.env.KEPLER_WORLD_BASE_URL ??
    process.env.PLANET_SERVER_PUBLIC_BASE_URL ??
    "https://planet.turingguild.com";

  return rawBaseUrl.replace(/\/+$/, "");
}

function getToken(): string {
  const token =
    process.env.KEPLER_PLANET_TOKEN ??
    process.env.KEPLER_WORLD_TOKEN ??
    process.env.PLANET_TOKEN;

  if (!token) {
    throw new Error(
      "Missing Kepler bearer token. Set KEPLER_PLANET_TOKEN, KEPLER_WORLD_TOKEN, or PLANET_TOKEN.",
    );
  }

  return token;
}

async function keplerRequest<T>(
  method: "GET" | "POST" | "DELETE",
  requestPath: string,
  baseUrlOverride?: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${baseUrlOverride ?? getBaseUrl()}${requestPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Kepler request failed (${response.status} ${response.statusText}): ${errorText}`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function printLocalRegistration(registration: LocalRegistration): void {
  console.log("Local registration");
  console.log(`Habitat name: ${registration.displayName}`);
  console.log(`Habitat UUID: ${registration.habitatUuid}`);
  console.log(`Habitat ID: ${registration.habitatId}`);
  console.log(`Base URL: ${registration.baseUrl}`);
  console.log(`Registered at: ${registration.registeredAt}`);
}

function printRemoteHabitat(habitat: HabitatRecord): void {
  console.log("Remote registration");
  console.log(`Habitat ID: ${habitat.id}`);
  console.log(`Slug: ${habitat.habitatSlug}`);
  console.log(`Display name: ${habitat.displayName}`);
  console.log(`Catalog version: ${habitat.catalogVersion}`);
  console.log(`Status: ${habitat.status}`);
  console.log(`Last seen at: ${habitat.lastSeenAt ?? "never"}`);
}

function printModule(moduleRecord: LocalModule): void {
  console.log(JSON.stringify(moduleRecord, null, 2));
}

function collectValues(value: string, previous: string[] = []): string[] {
  previous.push(value);
  return previous;
}

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
  habitat unregister
  habitat module list

Notes:
  Local state is stored in ${getHabitatDirPath()}.
  The CLI reads auth from KEPLER_PLANET_TOKEN, KEPLER_WORLD_TOKEN, or PLANET_TOKEN.
  The CLI reads the base URL from KEPLER_BASE_URL, KEPLER_WORLD_BASE_URL, or PLANET_SERVER_PUBLIC_BASE_URL.
`,
  );

program
  .command("register")
  .description("Register this habitat with Kepler.")
  .requiredOption("--name <name>", "Habitat display name")
  .action(async (options: { name: string }) => {
    const existingRegistration = loadRegistration();

    if (existingRegistration) {
      console.log(
        `This CLI is already registered as "${existingRegistration.displayName}" (${existingRegistration.habitatId}).`,
      );
      console.log("Run `habitat status` to inspect it or `habitat unregister` first.");
      process.exitCode = 1;
      return;
    }

    const habitatUuid = crypto.randomUUID();
    const response = await keplerRequest<RegistrationResponse>(
      "POST",
      "/habitats/register",
      undefined,
      {
        habitatUuid,
        displayName: options.name,
      },
    );

    const blueprints = indexBlueprints(response.blueprints);
    const modules = hydrateModulesFromStarterModules(response.starterModules, blueprints);
    const registration: LocalRegistration = {
      habitatId: response.habitatId,
      habitatUuid,
      displayName: options.name,
      baseUrl: getBaseUrl(),
      registeredAt: new Date().toISOString(),
    };

    saveRegistration(registration);
    saveBlueprints(blueprints);
    saveModules(modules);
    console.log(`Registered "${registration.displayName}" with Kepler.`);
    printLocalRegistration(registration);
    console.log(`Local modules hydrated: ${Object.keys(modules).length}`);
  });

program
  .command("status")
  .description("Show the current local and remote registration status.")
  .action(async () => {
    const registration = loadRegistration();

    if (!registration) {
      console.log("This CLI is not registered with Kepler yet.");
      console.log('Run `habitat register --name "<habitat name>"` to register.');
      return;
    }

    printLocalRegistration(registration);
    console.log(`Local modules: ${Object.keys(loadModules()).length}`);
    console.log("");

    const response = await keplerRequest<HabitatResponse>(
      "GET",
      `/habitats/${registration.habitatId}/registration`,
      registration.baseUrl,
    );
    printRemoteHabitat(response.habitat);
  });

program
  .command("unregister")
  .description("Delete the remote habitat registration and clear local registration state.")
  .action(async () => {
    const registration = loadRegistration();

    if (!registration) {
      console.log("This CLI is not registered with Kepler.");
      return;
    }

    await keplerRequest<void>("DELETE", `/habitats/${registration.habitatId}`, registration.baseUrl);
    deleteAllLocalState();
    console.log(`Unregistered "${registration.displayName}" and removed local registration state.`);
  });

const moduleCommand = program
  .command("module")
  .description("Create, inspect, update, and delete local Habitat modules.");

moduleCommand.addHelpText(
  "after",
  `
Examples:
  habitat module list
  habitat module show <module-id>
  habitat module create --blueprint-id command-module --name "Command Module Copy"
  habitat module update <module-id> --name "Updated Name" --status active
  habitat module delete <module-id>
`,
);

moduleCommand.action(() => {
  moduleCommand.outputHelp();
});

moduleCommand
  .command("list")
  .description("List all local Habitat modules.")
  .action(() => {
    const modules = loadModules();
    const moduleRecords = Object.values(modules);

    if (moduleRecords.length === 0) {
      console.log("No local modules found.");
      return;
    }

    console.log(`Local modules (${moduleRecords.length}):`);
    for (const moduleRecord of moduleRecords) {
      console.log(
        `- ${moduleRecord.id}: ${moduleRecord.displayName} [${
          moduleRecord.moduleType ?? moduleRecord.blueprintId
        }]`,
      );
    }
  });

moduleCommand
  .command("show")
  .description("Show one local Habitat module.")
  .argument("<moduleId>", "Module ID")
  .action((moduleId: string) => {
    const moduleRecord = loadModules()[moduleId];

    if (!moduleRecord) {
      console.log(`No local module named "${moduleId}" was found.`);
      process.exitCode = 1;
      return;
    }

    printModule(moduleRecord);
  });

moduleCommand
  .command("create")
  .description("Create a local Habitat module from a cached blueprint.")
  .requiredOption("--blueprint-id <blueprintId>", "Blueprint ID")
  .requiredOption("--name <name>", "Module display name")
  .action((options: { blueprintId: string; name: string }) => {
    const blueprints = loadBlueprints();

    if (!blueprints[options.blueprintId]) {
      console.log(
        `No cached blueprint named "${options.blueprintId}" was found. Register first or use a cached blueprint ID.`,
      );
      process.exitCode = 1;
      return;
    }

    const modules = loadModules();
    const moduleRecord = createLocalModule(modules, blueprints, options.blueprintId, options.name);
    modules[moduleRecord.id] = moduleRecord;
    saveModules(modules);

    console.log(`Created local module "${moduleRecord.displayName}".`);
    printModule(moduleRecord);
  });

moduleCommand
  .command("update")
  .description("Update a local Habitat module.")
  .argument("<moduleId>", "Module ID")
  .option("--name <name>", "Update the module display name")
  .option("--status <status>", "Set runtimeAttributes.status")
  .option("--set-runtime <key=value>", "Set one runtime attribute", collectValues, [])
  .option("--connect-to <moduleId>", "Add a module connection", collectValues, [])
  .option("--disconnect-from <moduleId>", "Remove a module connection", collectValues, [])
  .action(
    (
      moduleId: string,
      options: {
        name?: string;
        status?: string;
        setRuntime: string[];
        connectTo: string[];
        disconnectFrom: string[];
      },
    ) => {
      const modules = loadModules();
      const moduleRecord = modules[moduleId];

      if (!moduleRecord) {
        console.log(`No local module named "${moduleId}" was found.`);
        process.exitCode = 1;
        return;
      }

      let hasChanges = false;

      if (typeof options.name === "string") {
        moduleRecord.displayName = options.name;
        hasChanges = true;
      }

      if (typeof options.status === "string") {
        moduleRecord.runtimeAttributes.status = options.status;
        hasChanges = true;
      }

      for (const assignment of options.setRuntime) {
        const { key, value } = parseRuntimeAssignment(assignment);
        moduleRecord.runtimeAttributes[key] = value;
        hasChanges = true;
      }

      for (const connectedModuleId of options.connectTo) {
        if (!modules[connectedModuleId]) {
          console.log(`Cannot connect to missing module "${connectedModuleId}".`);
          process.exitCode = 1;
          return;
        }

        if (!moduleRecord.connectedTo.includes(connectedModuleId)) {
          moduleRecord.connectedTo.push(connectedModuleId);
          hasChanges = true;
        }
      }

      for (const disconnectedModuleId of options.disconnectFrom) {
        const nextConnections = moduleRecord.connectedTo.filter(
          (connectedModuleId) => connectedModuleId !== disconnectedModuleId,
        );

        if (nextConnections.length !== moduleRecord.connectedTo.length) {
          moduleRecord.connectedTo = nextConnections;
          hasChanges = true;
        }
      }

      if (!hasChanges) {
        console.log("No updates were provided.");
        return;
      }

      saveModules(modules as ModuleIndex);
      console.log(`Updated local module "${moduleRecord.id}".`);
      printModule(moduleRecord);
    },
  );

moduleCommand
  .command("delete")
  .description("Delete a local Habitat module.")
  .argument("<moduleId>", "Module ID")
  .action((moduleId: string) => {
    const modules = loadModules();

    if (!modules[moduleId]) {
      console.log(`No local module named "${moduleId}" was found.`);
      process.exitCode = 1;
      return;
    }

    const nextModules = disconnectDeletedModule(modules, moduleId);
    saveModules(nextModules);
    console.log(`Deleted local module "${moduleId}".`);
  });

program.action(() => {
  program.outputHelp();
});

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
