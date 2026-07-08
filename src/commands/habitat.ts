import { Command } from "commander";
import {
  deleteHabitatRequest,
  getBaseUrl,
  getHabitatRegistrationRequest,
  registerHabitatRequest,
} from "../kepler";
import { printLocalRegistration, printRemoteHabitat } from "../output";
import {
  deleteAllLocalState,
  hydrateModulesFromStarterModules,
  indexBlueprints,
  loadModules,
  loadRegistration,
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
    .action((ticks: string) => {
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
      const { modules: nextModules, summary } = runPowerTicks(modules, tickCount);

      saveModules(nextModules);

      console.log(`Advanced ${summary.tickCount} tick(s).`);
      console.log(`Total power demand: ${summary.totalDemandKw} kW`);
      console.log(`Power drained: ${summary.totalDrainedKw} kW`);
      console.log(`Shortfall: ${summary.shortfallKw} kW`);

      if (summary.batteriesUsed.length > 0) {
        console.log("Battery drain:");
        for (const batterySummary of summary.batteriesUsed) {
          console.log(
            `- ${batterySummary.moduleId}: drained ${batterySummary.drainedKw} kW, remaining ${batterySummary.remainingChargeKw} kW`,
          );
        }
      } else {
        console.log("No batteries were available to drain.");
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
