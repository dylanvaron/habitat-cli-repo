import { Command } from "commander";
import { listOfficialResources } from "../kepler";

export function registerResourceCommands(program: Command): void {
  const resourceCommand = program
    .command("resource")
    .description("Inspect official Kepler resource catalog entries.");

  resourceCommand.addHelpText(
    "after",
    `
Examples:
  habitat resource list
  habitat resource list --version 2026-06-24
`,
  );

  resourceCommand.action(() => {
    resourceCommand.outputHelp();
  });

  resourceCommand
    .command("list")
    .description("List official Kepler resource catalog entries.")
    .option("--version <catalogVersion>", "Optional catalog version")
    .action(async (options: { version?: string }) => {
      const response = await listOfficialResources(options.version);

      console.log(`Official resources (${response.resources.length}):`);
      for (const resource of response.resources) {
        const unitSuffix = typeof resource.unit === "string" ? ` [${resource.unit}]` : "";
        console.log(
          `- ${resource.resourceType}: ${resource.displayName} (${resource.kind}, ${resource.rarity})${unitSuffix}`,
        );
      }

      console.log(`Catalog version: ${response.catalogVersion}`);
    });
}
