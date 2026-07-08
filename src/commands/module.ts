import { Command } from "commander";
import { printModule, printModuleStatusTable } from "../output";
import {
  createLocalModule,
  disconnectDeletedModule,
  getModulePowerDrawKw,
  isModuleRuntimeStatus,
  loadBlueprints,
  loadModules,
  parseRuntimeAssignment,
  saveModules,
  setModuleRuntimeStatus,
  type ModuleIndex,
} from "../state";

function collectValues(value: string, previous: string[] = []): string[] {
  previous.push(value);
  return previous;
}

export function registerModuleCommands(program: Command): void {
  const moduleCommand = program
    .command("module")
    .description("Create, inspect, update, and delete local Habitat modules.");

  moduleCommand.addHelpText(
    "after",
    `
Examples:
  habitat module list
  habitat module status
  habitat module set-status <module-id> <status>
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
    .command("status")
    .description("Show each module's current state and power draw.")
    .action(() => {
      const modules = Object.values(loadModules());

      if (modules.length === 0) {
        console.log("No local modules found.");
        return;
      }

      printModuleStatusTable(modules);
    });

  moduleCommand
    .command("set-status")
    .description("Change a local module's runtime status.")
    .argument("<moduleId>", "Module ID")
    .argument("<status>", "New runtime status: offline, idle, online, active, or damaged")
    .action((moduleId: string, status: string) => {
      if (!isModuleRuntimeStatus(status)) {
        console.log(
          `Invalid status "${status}". Use one of: offline, idle, online, active, damaged.`,
        );
        process.exitCode = 1;
        return;
      }

      const modules = loadModules();

      try {
        const moduleRecord = setModuleRuntimeStatus(modules, moduleId, status);
        saveModules(modules);

        const powerDrawKw = getModulePowerDrawKw(moduleRecord);
        console.log(
          `Updated ${moduleRecord.id} to ${status}. Current power draw: ${powerDrawKw} kW.`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(message);
        process.exitCode = 1;
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
}
