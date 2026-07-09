import { Command } from "commander";
import { printBuild } from "../output";
import {
  assignBuildFacility,
  cancelLocalBuild,
  createLocalBuild,
  validateBuildFacilityAvailability,
  loadBuilds,
  loadBlueprints,
  loadModules,
  loadResourceInventory,
  saveModules,
  saveBuilds,
  saveResourceInventory,
  spendResourceInventory,
  synchronizeWorkshopAssignments,
  validateBlueprintCanBuildAsModule,
  validateBuildFacilityRequirement,
  validateSupplyCacheOnline,
} from "../state";

export function registerConstructCommands(program: Command): void {
  const constructCommand = program
    .command("construct")
    .description("Queue and inspect local Habitat module construction.");

  constructCommand.addHelpText(
    "after",
    `
Examples:
  habitat construct --blueprint-id greenhouse --name "Greenhouse Alpha"
  habitat construct --blueprint-id greenhouse --name "New Greenhouse" --dry-run
  habitat construct list
  habitat construct show greenhouse-build-1
  habitat construct cancel greenhouse-build-1
`,
  );

  constructCommand
    .option("--blueprint-id <blueprintId>", "Blueprint ID")
    .option("--name <name>", "Module display name")
    .option("--dry-run", "Check whether construction would succeed without changing local files")
    .action((options: { blueprintId?: string; name?: string; dryRun?: boolean }) => {
      try {
        if (!options.blueprintId || !options.name) {
          console.log('Provide both `--blueprint-id` and `--name` to queue construction.');
          console.log('Run `habitat construct --help` for examples.');
          process.exitCode = 1;
          return;
        }

        const blueprints = loadBlueprints();
        const blueprint = validateBlueprintCanBuildAsModule(blueprints, options.blueprintId);
        const modules = loadModules();
        const builds = loadBuilds();
        synchronizeWorkshopAssignments(modules, builds);
        validateSupplyCacheOnline(modules);
        validateBuildFacilityRequirement(modules, blueprint);
        validateBuildFacilityAvailability(modules, builds, blueprint);

        const resourceInventory = loadResourceInventory();
        const nextInventory = spendResourceInventory(resourceInventory, blueprint.inputs ?? {});
        const buildRecord = createLocalBuild(builds, blueprint, options.name);
        const assignedFacilityModuleId = assignBuildFacility(modules, buildRecord);

        if (options.dryRun) {
          console.log(
            `Construction is possible for "${options.name}" from blueprint "${buildRecord.blueprintId}".`,
          );
          console.log(`Required ticks: ${buildRecord.requiredTicks}`);
          if (assignedFacilityModuleId) {
            console.log(`Assigned facility: ${assignedFacilityModuleId}`);
          }

          const consumedResources = Object.entries(buildRecord.consumedResources);

          if (consumedResources.length > 0) {
            console.log("Resources that would be spent:");
            for (const [resourceType, amount] of consumedResources) {
              console.log(`- ${resourceType}: ${amount}`);
            }
          } else {
            console.log("No local resources would be required for this build.");
          }

          const remainingResources = Object.entries(nextInventory).sort(([left], [right]) =>
            left.localeCompare(right),
          );

          if (remainingResources.length > 0) {
            console.log("Resources remaining after the simulated build:");
            for (const [resourceType, amount] of remainingResources) {
              console.log(`- ${resourceType}: ${amount}`);
            }
          } else {
            console.log("No local resources would remain after the simulated build.");
          }

          return;
        }

        builds[buildRecord.id] = buildRecord;
        saveModules(modules);
        saveResourceInventory(nextInventory);
        saveBuilds(builds);

        console.log(
          `Queued build "${buildRecord.id}" for "${buildRecord.displayName}" from blueprint "${buildRecord.blueprintId}".`,
        );
        console.log(`Required ticks: ${buildRecord.requiredTicks}`);
        if (assignedFacilityModuleId) {
          console.log(`Assigned facility: ${assignedFacilityModuleId}`);
        }

        const consumedResources = Object.entries(buildRecord.consumedResources);

        if (consumedResources.length > 0) {
          console.log("Resources spent:");
          for (const [resourceType, amount] of consumedResources) {
            console.log(`- ${resourceType}: ${amount}`);
          }
        } else {
          console.log("No local resources were required for this build.");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(message);
        process.exitCode = 1;
      }
    });

  constructCommand
    .command("list")
    .description("List all queued local module builds.")
    .action(() => {
      const builds = Object.values(loadBuilds()).sort((left, right) => left.id.localeCompare(right.id));

      if (builds.length === 0) {
        console.log("No local module builds are queued.");
        return;
      }

      console.log(`Queued builds (${builds.length}):`);
      for (const buildRecord of builds) {
        console.log(
          `- ${buildRecord.id}: ${buildRecord.displayName} [${buildRecord.blueprintId}] ${buildRecord.remainingTicks}/${buildRecord.requiredTicks} ticks remaining`,
        );
      }
    });

  constructCommand
    .command("show")
    .description("Show one queued local module build.")
    .argument("<buildId>", "Build ID")
    .action((buildId: string) => {
      const buildRecord = loadBuilds()[buildId];

      if (!buildRecord) {
        console.log(`No local build named "${buildId}" was found.`);
        process.exitCode = 1;
        return;
      }

      printBuild(buildRecord);
    });

  constructCommand
    .command("cancel")
    .description("Cancel one queued local module build without refunding materials.")
    .argument("<buildId>", "Build ID")
    .action((buildId: string) => {
      try {
        const result = cancelLocalBuild(loadModules(), loadBuilds(), buildId);
        saveModules(result.modules);
        saveBuilds(result.builds);
        console.log(
          `Canceled build "${result.canceledBuild.id}" for "${result.canceledBuild.displayName}".`,
        );
        console.log(`Reason: ${result.reason}`);
        console.log("Spent materials were not refunded.");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(message);
        process.exitCode = 1;
      }
    });
}
