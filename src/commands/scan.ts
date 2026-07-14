import { Command } from "commander";
import { listCatalogResources, scanResources } from "../api";
import { printScanResponse } from "../output";

export function registerScanCommands(program: Command): void {
  program
    .command("scan")
    .description("Estimate nearby resources through the local Habitat API.")
    .requiredOption("--x <integer>", "current x coordinate")
    .requiredOption("--y <integer>", "current y coordinate")
    .requiredOption("--strength <0-100>", "effective sensor strength")
    .option("--radius <0-5>", "scan radius, default 0", "0")
    .option("--json", "print the complete JSON response")
    .action(
      async (options: {
        x: string;
        y: string;
        strength: string;
        radius: string;
        json?: boolean;
      }) => {
        try {
          const scanOptions = {
            x: Number(options.x),
            y: Number(options.y),
            sensorStrength: Number(options.strength),
            radiusTiles: Number(options.radius),
          };
          const response = await scanResources(scanOptions);

          if (options.json) {
            console.log(JSON.stringify(response));
            return;
          }

          const resourceCatalog = await listCatalogResources();
          printScanResponse(response, {
            ...scanOptions,
            officialResources: resourceCatalog.resources,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.log(message);
          process.exitCode = 1;
        }
      },
    );
}
