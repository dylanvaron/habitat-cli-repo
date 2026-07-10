import { Command } from "commander";
import { addInventoryResource, getInventory, listCatalogResources } from "../api";

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
  habitat resource give water 50
  habitat resource show
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
      const response = await listCatalogResources(options.version);

      console.log(`Official resources (${response.resources.length}):`);
      for (const resource of response.resources) {
        const unitSuffix = typeof resource.unit === "string" ? ` [${resource.unit}]` : "";
        console.log(
          `- ${resource.resourceType}: ${resource.displayName} (${resource.kind}, ${resource.rarity})${unitSuffix}`,
        );
      }

      console.log(`Catalog version: ${response.catalogVersion}`);
    });

  resourceCommand
    .command("give")
    .description("Add a quantity of one resource to the local Habitat resource store.")
    .argument("<resourceType>", "Resource type")
    .argument("<amount>", "Amount to add")
    .action(async (resourceType: string, amount: string) => {
      const numericAmount = Number(amount);

      try {
        const response = await addInventoryResource(resourceType, numericAmount);
        console.log(
          `Added ${numericAmount} ${resourceType}. New total: ${response.inventory[resourceType]} ${resourceType}.`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(message);
        process.exitCode = 1;
      }
    });

  resourceCommand
    .command("show")
    .description("Show all locally tracked Habitat resources and quantities.")
    .action(async () => {
      const resourceInventory = (await getInventory()).inventory;
      const resources = Object.entries(resourceInventory).sort(([left], [right]) =>
        left.localeCompare(right),
      );

      if (resources.length === 0) {
        console.log("No local resources are tracked yet.");
        return;
      }

      console.log(`Local resources (${resources.length}):`);
      for (const [resourceType, amount] of resources) {
        console.log(`- ${resourceType}: ${amount}`);
      }
    });
}
