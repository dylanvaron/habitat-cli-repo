import { Command } from "commander";
import { getWorldSolarIrradiance } from "../kepler";

function describeSolarCondition(condition: string): string {
  switch (condition) {
    case "clear":
      return "Sunlight is strong right now, so solar power should work very well.";
    case "dusty":
      return "Sunlight is reduced by dust, so solar power will be weaker than normal.";
    case "storm":
      return "A storm is blocking a lot of sunlight, so solar power will be very limited.";
    case "night":
      return "It is currently dark, so solar panels will not produce useful power right now.";
    default:
      return "This is the current sunlight condition reported by Kepler.";
  }
}

export function registerSolarCommands(program: Command): void {
  const solarCommand = program
    .command("solar")
    .description("Check the current sunlight conditions reported by Kepler.");

  solarCommand.addHelpText(
    "after",
    `
Examples:
  habitat solar status
`,
  );

  solarCommand
    .command("status")
    .description("Show the current solar irradiance and sunlight condition.")
    .action(async () => {
      try {
        const response = await getWorldSolarIrradiance();
        const { wPerM2, condition } = response.solarIrradiance;

        console.log(`Current solar condition: ${condition}`);
        console.log(`Current irradiance: ${wPerM2} W/m^2`);
        console.log(describeSolarCondition(condition));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(message);
        process.exitCode = 1;
      }
    });
}
