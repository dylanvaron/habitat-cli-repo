import { Command } from "commander";
import { getOfficialBlueprint, listOfficialBlueprints } from "../kepler";

export function registerCatalogCommands(program: Command): void {
  const catalogCommand = program
    .command("catalog")
    .description("Inspect official Kepler catalog data.");

  const catalogBlueprintsCommand = catalogCommand
    .command("blueprints")
    .description("List and inspect official Kepler production blueprints.");

  catalogBlueprintsCommand.addHelpText(
    "after",
    `
Examples:
  habitat catalog blueprints list
  habitat catalog blueprints list --version 2026-06-24
  habitat catalog blueprints show survey-rover
  habitat catalog blueprints show rover-bay-upgrade --version 2026-06-24
`,
  );

  catalogBlueprintsCommand.action(() => {
    catalogBlueprintsCommand.outputHelp();
  });

  catalogBlueprintsCommand
    .command("list")
    .description("List official Kepler production blueprints.")
    .option("--version <catalogVersion>", "Optional catalog version")
    .action(async (options: { version?: string }) => {
      const response = await listOfficialBlueprints(options.version);

      console.log(`Official blueprints (${response.blueprints.length}):`);
      for (const blueprint of response.blueprints) {
        console.log(`- ${blueprint.blueprintId}: ${blueprint.displayName}`);
      }

      console.log(`Catalog version: ${response.catalogVersion}`);
    });

  catalogBlueprintsCommand
    .command("show")
    .description("Show one official Kepler production blueprint.")
    .argument("<blueprintId>", "Blueprint ID")
    .option("--version <catalogVersion>", "Optional catalog version")
    .action(async (blueprintId: string, options: { version?: string }) => {
      try {
        const response = await getOfficialBlueprint(blueprintId, options.version);
        console.log(JSON.stringify(response.blueprint, null, 2));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (message.includes("404")) {
          console.log(`No official blueprint named "${blueprintId}" was found.`);
          process.exitCode = 1;
          return;
        }

        throw error;
      }
    });
}
