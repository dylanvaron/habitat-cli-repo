import { Command } from "commander";
import { getCatalogBlueprint, listCatalogBlueprints } from "../api";

export function registerCatalogCommands(program: Command): void {
  const catalogCommand = program
    .command("catalog")
    .description("Inspect official Kepler catalog data.");

  const catalogBlueprintsCommand = catalogCommand
    .command("blueprints")
    .description("List and inspect official Kepler production blueprints.");

  registerBlueprintCommands(catalogBlueprintsCommand, "habitat catalog blueprints");

  const blueprintCommand = program
    .command("blueprints")
    .description("List and inspect official Kepler production blueprints.");

  registerBlueprintCommands(blueprintCommand, "habitat blueprints");
}

function registerBlueprintCommands(command: Command, commandPath: string): void {
  command.addHelpText(
    "after",
    `
Examples:
  ${commandPath} list
  ${commandPath} list --version 2026-06-24
  ${commandPath} show survey-rover
  ${commandPath} show rover-bay-upgrade --version 2026-06-24
`,
  );

  command.action(() => {
    command.outputHelp();
  });

  command
    .command("list")
    .description("List official Kepler production blueprints.")
    .option("--version <catalogVersion>", "Optional catalog version")
    .action(async (options: { version?: string }) => {
      const response = await listCatalogBlueprints(options.version);

      console.log(`Official blueprints (${response.blueprints.length}):`);
      for (const blueprint of response.blueprints) {
        console.log(`- ${blueprint.blueprintId}: ${blueprint.displayName}`);
      }

      console.log(`Catalog version: ${response.catalogVersion}`);
    });

  command
    .command("show")
    .description("Show one official Kepler production blueprint.")
    .argument("<blueprintId>", "Blueprint ID")
    .option("--version <catalogVersion>", "Optional catalog version")
    .action(async (blueprintId: string, options: { version?: string }) => {
      try {
        const response = await getCatalogBlueprint(blueprintId, options.version);
        console.log(JSON.stringify(response.blueprint, null, 2));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (message.includes("Blueprint not found") || message.includes("404")) {
          console.log(`No official blueprint named "${blueprintId}" was found.`);
          process.exitCode = 1;
          return;
        }

        throw error;
      }
    });
}
