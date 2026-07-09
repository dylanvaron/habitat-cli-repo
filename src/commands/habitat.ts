import { Command } from "commander";
import {
  deleteHabitatRequest,
  getBaseUrl,
  getHabitatRegistrationRequest,
  getWorldSolarIrradiance,
  registerHabitatRequest,
} from "../kepler";
import { printLocalRegistration, printRemoteHabitat } from "../output";
import {
  advanceBuildQueue,
  cancelBuildsForForcedOfflineModules,
  deleteAllLocalState,
  hydrateModulesFromStarterModules,
  indexBlueprints,
  loadBlueprints,
  loadBuilds,
  loadModules,
  loadRegistration,
  saveBuilds,
  runPowerTicks,
  saveBlueprints,
  saveModules,
  saveRegistration,
  type LocalRegistration,
} from "../state";

export function registerHabitatCommands(program: Command): void {
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
      const response = await registerHabitatRequest(options.name, habitatUuid);

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
    .command("tick")
    .description("Advance the local habitat simulation by the requested number of steps.")
    .argument("<ticks>", "Number of ticks to advance")
    .action(async (ticks: string) => {
      const registration = loadRegistration();

      if (!registration) {
        console.log("This CLI is not registered with Kepler yet.");
        console.log('Run `habitat register --name "<habitat name>"` to register.');
        process.exitCode = 1;
        return;
      }

      const tickCount = Number(ticks);

      if (!Number.isInteger(tickCount) || tickCount <= 0) {
        console.log(`Invalid tick count "${ticks}". Provide a positive whole number.`);
        process.exitCode = 1;
        return;
      }

      const modules = loadModules();
      const builds = loadBuilds();
      const blueprints = loadBlueprints();
      const solarResponse = await getWorldSolarIrradiance();
      const irradianceWPerM2 = solarResponse.solarIrradiance.wPerM2;
      const { modules: powerTickModules, summary } = runPowerTicks(
        modules,
        tickCount,
        irradianceWPerM2,
      );
      const {
        modules: postCancellationModules,
        builds: postCancellationBuilds,
        canceledBuilds,
      } = cancelBuildsForForcedOfflineModules(
        powerTickModules,
        builds,
        summary.forcedOfflineModuleIds,
      );
      const {
        modules: nextModules,
        builds: nextBuilds,
        summary: buildSummary,
      } = advanceBuildQueue(postCancellationModules, postCancellationBuilds, blueprints, tickCount);

      saveModules(nextModules);
      saveBuilds(nextBuilds);

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
      console.log(`Queued builds: ${Object.keys(loadBuilds()).length}`);
      console.log("");

      const response = await getHabitatRegistrationRequest(
        registration.habitatId,
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

      await deleteHabitatRequest(registration.habitatId, registration.baseUrl);
      deleteAllLocalState();
      console.log(`Unregistered "${registration.displayName}" and removed local registration state.`);
    });
}
