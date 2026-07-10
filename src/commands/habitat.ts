import { Command } from "commander";
import {
  createRegistration,
  deleteRegistration,
  getRegistrationStatus,
  runTick,
} from "../api";
import { printLocalRegistration, printRemoteHabitat } from "../output";

export function registerHabitatCommands(program: Command): void {
  program
    .command("register")
    .description("Register this habitat with Kepler.")
    .requiredOption("--name <name>", "Habitat display name")
    .action(async (options: { name: string }) => {
      try {
        const response = await createRegistration(options.name);
        console.log(`Registered "${response.registration.displayName}" with Kepler.`);
        printLocalRegistration(response.registration);
        console.log(`Local modules hydrated: ${response.hydratedModulesCount}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(message);
        process.exitCode = 1;
      }
    });

  program
    .command("tick")
    .description("Advance the local habitat simulation by the requested number of steps.")
    .argument("<ticks>", "Number of ticks to advance")
    .action(async (ticks: string) => {
      const tickCount = Number(ticks);

      if (!Number.isInteger(tickCount) || tickCount <= 0) {
        console.log(`Invalid tick count "${ticks}". Provide a positive whole number.`);
        process.exitCode = 1;
        return;
      }

      try {
        const response = await runTick(tickCount);
        const summary = response.powerSummary;
        const buildSummary = response.buildSummary;
        const canceledBuilds = response.canceledBuilds;

        console.log(`Advanced ${summary.tickCount} tick(s).`);
        console.log(`Average power draw: ${summary.averagePowerDrawKw} kW`);
        console.log(`Total energy demand: ${summary.totalEnergyDemandKwh} kWh`);
        console.log(`Energy drained: ${summary.totalEnergyDrainedKwh} kWh`);
        console.log(`Energy shortfall: ${summary.energyShortfallKwh} kWh`);

        console.log("Solar generation:");
        console.log(`- Irradiance used: ${summary.solar.irradianceWPerM2} W/m^2`);
        console.log(`- Total generated: ${summary.solar.totalGeneratedEnergyKwh} kWh`);
        console.log(`- Discarded excess: ${summary.solar.discardedEnergyKwh} kWh`);
        if (summary.solar.arraysUsed.length > 0) {
          for (const arraySummary of summary.solar.arraysUsed) {
            console.log(
              `- ${arraySummary.moduleId}: generated ${arraySummary.generatedEnergyKwh} kWh`,
            );
          }
        } else {
          console.log("- No small solar arrays generated power.");
        }

        if (summary.batteriesUsed.length > 0) {
          console.log("Battery drain:");
          for (const batterySummary of summary.batteriesUsed) {
            console.log(
              `- ${batterySummary.moduleId}: drained ${batterySummary.drainedEnergyKwh} kWh, remaining ${batterySummary.remainingEnergyKwh} kWh`,
            );
          }
        } else {
          console.log("No batteries were available to drain.");
        }

        if (summary.forcedOfflineModuleIds.length > 0) {
          console.log("Forced offline:");
          for (const moduleId of summary.forcedOfflineModuleIds) {
            console.log(`- ${moduleId}`);
          }
        } else {
          console.log("No modules were forced offline.");
        }

        if (canceledBuilds.length > 0) {
          console.log("Canceled builds:");
          for (const canceledBuild of canceledBuilds) {
            console.log(
              `- ${canceledBuild.buildId} (${canceledBuild.displayName}): ${canceledBuild.reason}`,
            );
          }
        } else {
          console.log("No builds were canceled.");
        }

        console.log(`Queued builds advanced: ${buildSummary.advancedBuilds}`);
        if (buildSummary.completedBuilds.length > 0) {
          console.log("Completed builds:");
          for (const completedBuild of buildSummary.completedBuilds) {
            console.log(
              `- ${completedBuild.buildId}: completed as ${completedBuild.moduleId} (${completedBuild.displayName})`,
            );
          }
        } else {
          console.log("No queued builds completed.");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (message === "Habitat API request failed: This CLI is not registered with Kepler yet.") {
          console.log("This CLI is not registered with Kepler yet.");
          console.log('Run `habitat register --name "<habitat name>"` to register.');
          process.exitCode = 1;
          return;
        }

        console.log(message);
        process.exitCode = 1;
      }
    });

  program
    .command("status")
    .description("Show the current local and remote registration status.")
    .action(async () => {
      try {
        const response = await getRegistrationStatus();

        if (!response.registration) {
          console.log("This CLI is not registered with Kepler yet.");
          console.log('Run `habitat register --name "<habitat name>"` to register.');
          return;
        }

        printLocalRegistration(response.registration);
        console.log(`Local modules: ${response.localModulesCount}`);
        console.log(`Queued builds: ${response.queuedBuildsCount}`);
        console.log("");

        if (response.remoteHabitat) {
          printRemoteHabitat(response.remoteHabitat);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(message);
        process.exitCode = 1;
      }
    });

  program
    .command("unregister")
    .description("Delete the remote habitat registration and clear local registration state.")
    .action(async () => {
      try {
        const response = await deleteRegistration();
        console.log(`Unregistered "${response.displayName}" and removed local registration state.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (message === "Habitat API request failed: This CLI is not registered with Kepler.") {
          console.log("This CLI is not registered with Kepler.");
          return;
        }

        console.log(message);
        process.exitCode = 1;
      }
    });
}
