import { Command } from "commander";
import {
  createModule,
  deleteModule,
  getModule,
  listModules,
  setModuleStatus,
  updateModule,
} from "../api";
import { printModule, printModuleStatusTable } from "../output";
import {
  getModulePowerDrawKw,
  isModuleRuntimeStatus,
  parseRuntimeAssignment,
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
    .action(async () => {
      const response = await listModules();
      const moduleRecords = response.modules;

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
    .action(async () => {
      const modules = (await listModules()).modules;

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
    .action(async (moduleId: string, status: string) => {
      if (!isModuleRuntimeStatus(status)) {
        console.log(
          `Invalid status "${status}". Use one of: offline, idle, online, active, damaged.`,
        );
        process.exitCode = 1;
        return;
      }

      try {
        const response = await setModuleStatus(moduleId, status);
        const moduleRecord = response.module;

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
    .action(async (moduleId: string) => {
      try {
        const response = await getModule(moduleId);
        printModule(response.module);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(message);
        process.exitCode = 1;
      }
    });

  moduleCommand
    .command("create")
    .description("Directly create a local Habitat module from a cached blueprint.")
    .requiredOption("--blueprint-id <blueprintId>", "Blueprint ID")
    .requiredOption("--name <name>", "Module display name")
    .action(async (options: { blueprintId: string; name: string }) => {
      try {
        const response = await createModule(options.blueprintId, options.name);
        console.log(`Created local module "${response.module.displayName}".`);
        printModule(response.module);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(message);
        process.exitCode = 1;
      }
    });

  moduleCommand
    .command("update")
    .description("Update a local Habitat module.")
    .argument("<moduleId>", "Module ID")
    .option("--name <name>", "Update the module display name")
    .option("--status <status>", "Set runtimeAttributes.status")
    .option("--set-runtime <key=value>", "Set one runtime attribute", collectValues, [])
    .action(async (
      moduleId: string,
      options: {
        name?: string;
        status?: string;
        setRuntime: string[];
      },
    ) => {
        try {
          const runtimeAttributes: Record<string, unknown> = {};
          let hasChanges = false;
          let displayName: string | undefined;
          let status: string | undefined;

          if (typeof options.name === "string") {
            displayName = options.name;
            hasChanges = true;
          }

          if (typeof options.status === "string") {
            status = options.status;
            hasChanges = true;
          }

          for (const assignment of options.setRuntime) {
            const { key, value } = parseRuntimeAssignment(assignment);
            runtimeAttributes[key] = value;
            hasChanges = true;
          }

          if (!hasChanges) {
            console.log("No updates were provided.");
            return;
          }

          const response = await updateModule(moduleId, {
            displayName,
            status,
            runtimeAttributes:
              Object.keys(runtimeAttributes).length > 0 ? runtimeAttributes : undefined,
          });
          console.log(`Updated local module "${response.module.id}".`);
          printModule(response.module);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.log(message);
          process.exitCode = 1;
        }
      });

  moduleCommand
    .command("delete")
    .description("Delete a local Habitat module.")
    .argument("<moduleId>", "Module ID")
    .action(async (moduleId: string) => {
      try {
        await deleteModule(moduleId);
        console.log(`Deleted local module "${moduleId}".`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(message);
        process.exitCode = 1;
      }
    });
}
