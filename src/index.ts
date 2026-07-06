#!/usr/bin/env bun

import { Command } from "commander";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import packageJson from "../package.json";

const program = new Command();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const stateFilePath = path.resolve(__dirname, "../habitat-data.json");

type GreenhouseState = {
  temperature: number;
  humidity: number;
  airComposition: string;
  lightLevel: number;
  integrity: number;
  growing: Record<string, number>;
};

type BasicBattery = {
  name: string;
  chargeAmount: number;
  isCharging: boolean;
  providingEnergyTo: string | null;
  powerSystemName: string | null;
};

type PowerSystem = {
  name: string;
  basicBatteryNames: string[];
  numberOfBatteries: number;
  totalPowerStored: number;
  roomsReceivingPower: Record<string, number>;
};

type AirlockState = {
  pressureLevel: number;
  doorStatus: "open" | "closed";
  sanitation: string;
};

type WaterRecyclerState = {
  waterCapacity: number;
  cleanlinessLevel: number;
  filterCondition: string;
  filtrationRunning: boolean;
};

type OxygenSystemState = {
  oxygenLevel: number;
  airConcentration: string;
};

type HabitatState = {
  greenhouse: GreenhouseState;
  airlock: AirlockState;
  waterRecycler: WaterRecyclerState;
  oxygenSystem: OxygenSystemState;
  basicBatteries: Record<string, BasicBattery>;
  powerSystems: Record<string, PowerSystem>;
};

const defaultState: HabitatState = {
  greenhouse: {
    temperature: 24,
    humidity: 60,
    airComposition: "balanced",
    lightLevel: 75,
    integrity: 100,
    growing: {},
  },
  airlock: {
    pressureLevel: 100,
    doorStatus: "closed",
    sanitation: "clean",
  },
  waterRecycler: {
    waterCapacity: 100,
    cleanlinessLevel: 80,
    filterCondition: "good",
    filtrationRunning: false,
  },
  oxygenSystem: {
    oxygenLevel: 75,
    airConcentration: "balanced",
  },
  basicBatteries: {},
  powerSystems: {},
};

type HabitatStateFile = Partial<HabitatState> &
  Partial<GreenhouseState> & {
    greenhouse?: Partial<GreenhouseState>;
  };

function normalizeGrowing(
  growing: Partial<GreenhouseState>["growing"] | string[] | undefined,
): Record<string, number> {
  if (Array.isArray(growing)) {
    const normalized: Record<string, number> = {};

    for (const name of growing) {
      const trimmedName = name.trim();

      if (!trimmedName) {
        continue;
      }

      normalized[trimmedName] = (normalized[trimmedName] ?? 0) + 1;
    }

    return normalized;
  }

  if (!growing || typeof growing !== "object") {
    return {};
  }

  const normalized: Record<string, number> = {};

  for (const [name, count] of Object.entries(growing)) {
    if (typeof count !== "number" || Number.isNaN(count) || count <= 0) {
      continue;
    }

    normalized[name] = count;
  }

  return normalized;
}

function normalizeBasicBatteries(
  basicBatteries: unknown,
): Record<string, BasicBattery> {
  if (!basicBatteries || typeof basicBatteries !== "object") {
    return {};
  }

  const normalized: Record<string, BasicBattery> = {};

  for (const [name, battery] of Object.entries(
    basicBatteries as Record<string, Partial<BasicBattery>>,
  )) {
    normalized[name] = {
      name,
      chargeAmount:
        typeof battery.chargeAmount === "number" && !Number.isNaN(battery.chargeAmount)
          ? battery.chargeAmount
          : 0,
      isCharging: Boolean(battery.isCharging),
      providingEnergyTo:
        typeof battery.providingEnergyTo === "string" && battery.providingEnergyTo.trim()
          ? battery.providingEnergyTo
          : null,
      powerSystemName:
        typeof battery.powerSystemName === "string" && battery.powerSystemName.trim()
          ? battery.powerSystemName
          : null,
    };
  }

  return normalized;
}

function normalizeRoomsReceivingPower(roomsReceivingPower: unknown): Record<string, number> {
  if (!roomsReceivingPower || typeof roomsReceivingPower !== "object") {
    return {};
  }

  const normalized: Record<string, number> = {};

  for (const [room, demand] of Object.entries(
    roomsReceivingPower as Record<string, unknown>,
  )) {
    if (typeof demand !== "number" || Number.isNaN(demand) || demand < 0) {
      continue;
    }

    normalized[room] = demand;
  }

  return normalized;
}

function normalizePowerSystems(powerSystems: unknown): Record<string, PowerSystem> {
  if (!powerSystems || typeof powerSystems !== "object") {
    return {};
  }

  const normalized: Record<string, PowerSystem> = {};

  for (const [name, powerSystem] of Object.entries(
    powerSystems as Record<string, Partial<PowerSystem>>,
  )) {
    const basicBatteryNames = Array.isArray(powerSystem.basicBatteryNames)
      ? powerSystem.basicBatteryNames.filter(
          (batteryName): batteryName is string =>
            typeof batteryName === "string" && batteryName.trim().length > 0,
        )
      : [];

    normalized[name] = {
      name,
      basicBatteryNames,
      numberOfBatteries:
        typeof powerSystem.numberOfBatteries === "number" &&
        !Number.isNaN(powerSystem.numberOfBatteries)
          ? powerSystem.numberOfBatteries
          : basicBatteryNames.length,
      totalPowerStored:
        typeof powerSystem.totalPowerStored === "number" &&
        !Number.isNaN(powerSystem.totalPowerStored)
          ? powerSystem.totalPowerStored
          : 0,
      roomsReceivingPower: normalizeRoomsReceivingPower(powerSystem.roomsReceivingPower),
    };
  }

  return normalized;
}

function formatGrowing(growing: Record<string, number>): string {
  const entries = Object.entries(growing);

  if (entries.length === 0) {
    return "nothing yet";
  }

  return entries.map(([name, count]) => `${name} x${count}`).join(", ");
}

function parseBoolean(value: string): boolean {
  const normalizedValue = value.trim().toLowerCase();

  if (normalizedValue === "true") {
    return true;
  }

  if (normalizedValue === "false") {
    return false;
  }

  throw new Error('Expected "true" or "false".');
}

function collectValues(value: string, previous: string[] = []): string[] {
  previous.push(value);
  return previous;
}

function parseRoomDemandEntries(entries: string[] | undefined): Record<string, number> {
  if (!entries) {
    return {};
  }

  const roomsReceivingPower: Record<string, number> = {};

  for (const entry of entries) {
    const separatorIndex = entry.indexOf(":");

    if (separatorIndex <= 0 || separatorIndex === entry.length - 1) {
      throw new Error(`Invalid room demand "${entry}". Use room:demand.`);
    }

    const roomName = entry.slice(0, separatorIndex).trim();
    const demandValue = Number(entry.slice(separatorIndex + 1));

    if (!roomName) {
      throw new Error(`Invalid room demand "${entry}". Room name is required.`);
    }

    if (Number.isNaN(demandValue) || demandValue < 0) {
      throw new Error(`Invalid room demand "${entry}". Demand must be 0 or greater.`);
    }

    roomsReceivingPower[roomName] = demandValue;
  }

  return roomsReceivingPower;
}

function normalizeGreenhouse(greenhouse: Partial<GreenhouseState> | undefined): GreenhouseState {
  return {
    temperature:
      typeof greenhouse?.temperature === "number" && !Number.isNaN(greenhouse.temperature)
        ? greenhouse.temperature
        : defaultState.greenhouse.temperature,
    humidity:
      typeof greenhouse?.humidity === "number" && !Number.isNaN(greenhouse.humidity)
        ? greenhouse.humidity
        : defaultState.greenhouse.humidity,
    airComposition:
      typeof greenhouse?.airComposition === "string" && greenhouse.airComposition.trim()
        ? greenhouse.airComposition
        : defaultState.greenhouse.airComposition,
    lightLevel:
      typeof greenhouse?.lightLevel === "number" && !Number.isNaN(greenhouse.lightLevel)
        ? greenhouse.lightLevel
        : defaultState.greenhouse.lightLevel,
    integrity:
      typeof greenhouse?.integrity === "number" && !Number.isNaN(greenhouse.integrity)
        ? greenhouse.integrity
        : defaultState.greenhouse.integrity,
    growing: normalizeGrowing(greenhouse?.growing),
  };
}

function normalizeAirlock(airlock: Partial<AirlockState> | undefined): AirlockState {
  return {
    pressureLevel:
      typeof airlock?.pressureLevel === "number" && !Number.isNaN(airlock.pressureLevel)
        ? airlock.pressureLevel
        : defaultState.airlock.pressureLevel,
    doorStatus: airlock?.doorStatus === "open" ? "open" : "closed",
    sanitation:
      typeof airlock?.sanitation === "string" && airlock.sanitation.trim()
        ? airlock.sanitation
        : defaultState.airlock.sanitation,
  };
}

function normalizeWaterRecycler(
  waterRecycler: Partial<WaterRecyclerState> | undefined,
): WaterRecyclerState {
  return {
    waterCapacity:
      typeof waterRecycler?.waterCapacity === "number" &&
      !Number.isNaN(waterRecycler.waterCapacity)
        ? waterRecycler.waterCapacity
        : defaultState.waterRecycler.waterCapacity,
    cleanlinessLevel:
      typeof waterRecycler?.cleanlinessLevel === "number" &&
      !Number.isNaN(waterRecycler.cleanlinessLevel)
        ? waterRecycler.cleanlinessLevel
        : defaultState.waterRecycler.cleanlinessLevel,
    filterCondition:
      typeof waterRecycler?.filterCondition === "string" && waterRecycler.filterCondition.trim()
        ? waterRecycler.filterCondition
        : defaultState.waterRecycler.filterCondition,
    filtrationRunning: Boolean(waterRecycler?.filtrationRunning),
  };
}

function normalizeOxygenSystem(
  oxygenSystem: Partial<OxygenSystemState> | undefined,
): OxygenSystemState {
  return {
    oxygenLevel:
      typeof oxygenSystem?.oxygenLevel === "number" && !Number.isNaN(oxygenSystem.oxygenLevel)
        ? oxygenSystem.oxygenLevel
        : defaultState.oxygenSystem.oxygenLevel,
    airConcentration:
      typeof oxygenSystem?.airConcentration === "string" && oxygenSystem.airConcentration.trim()
        ? oxygenSystem.airConcentration
        : defaultState.oxygenSystem.airConcentration,
  };
}

function loadState(): HabitatState {
  if (!existsSync(stateFilePath)) {
    saveState(defaultState);
    return structuredClone(defaultState);
  }

  const fileContents = readFileSync(stateFilePath, "utf8");
  const parsedState = JSON.parse(fileContents) as HabitatStateFile;
  const greenhouseSource = parsedState.greenhouse ?? parsedState;
  const state: HabitatState = {
    greenhouse: normalizeGreenhouse(greenhouseSource),
    airlock: normalizeAirlock(parsedState.airlock),
    waterRecycler: normalizeWaterRecycler(parsedState.waterRecycler),
    oxygenSystem: normalizeOxygenSystem(parsedState.oxygenSystem),
    basicBatteries: normalizeBasicBatteries(parsedState.basicBatteries),
    powerSystems: normalizePowerSystems(parsedState.powerSystems),
  };

  syncAllPowerSystems(state);
  return state;
}

function saveState(state: HabitatState): void {
  writeFileSync(stateFilePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function syncPowerSystem(state: HabitatState, powerSystemName: string): void {
  const powerSystem = state.powerSystems[powerSystemName];

  if (!powerSystem) {
    return;
  }

  const attachedBatteryNames = powerSystem.basicBatteryNames.filter(
    (batteryName, index, names) =>
      state.basicBatteries[batteryName] &&
      state.basicBatteries[batteryName].powerSystemName === powerSystemName &&
      names.indexOf(batteryName) === index,
  );

  powerSystem.basicBatteryNames = attachedBatteryNames;
  powerSystem.numberOfBatteries = attachedBatteryNames.length;
  powerSystem.totalPowerStored = attachedBatteryNames.reduce((total, batteryName) => {
    return total + state.basicBatteries[batteryName].chargeAmount;
  }, 0);
}

function syncAllPowerSystems(state: HabitatState): void {
  for (const powerSystem of Object.values(state.powerSystems)) {
    powerSystem.basicBatteryNames = [];
  }

  for (const battery of Object.values(state.basicBatteries)) {
    if (!battery.powerSystemName) {
      continue;
    }

    const powerSystem = state.powerSystems[battery.powerSystemName];

    if (!powerSystem) {
      battery.powerSystemName = null;
      continue;
    }

    if (!powerSystem.basicBatteryNames.includes(battery.name)) {
      powerSystem.basicBatteryNames.push(battery.name);
    }
  }

  for (const powerSystemName of Object.keys(state.powerSystems)) {
    syncPowerSystem(state, powerSystemName);
  }
}

function printGreenhouseStatus(state: HabitatState): void {
  const greenhouse = state.greenhouse;
  console.log("Greenhouse status");
  console.log(`Temperature: ${greenhouse.temperature} C`);
  console.log(`Humidity: ${greenhouse.humidity}%`);
  console.log(`Air composition: ${greenhouse.airComposition}`);
  console.log(`Light level: ${greenhouse.lightLevel}`);
  console.log(`Integrity: ${greenhouse.integrity}%`);
  console.log(`Growing: ${formatGrowing(greenhouse.growing)}`);
}

function printBasicBattery(battery: BasicBattery): void {
  console.log(`basic-battery: ${battery.name}`);
  console.log(`Charge amount: ${battery.chargeAmount}`);
  console.log(`Charging: ${battery.isCharging ? "yes" : "no"}`);
  console.log(`Providing energy to: ${battery.providingEnergyTo ?? "nothing"}`);
  console.log(`Attached power system: ${battery.powerSystemName ?? "none"}`);
}

function printPowerSystem(state: HabitatState, powerSystem: PowerSystem): void {
  console.log(`power-system: ${powerSystem.name}`);
  console.log(`Number of batteries: ${powerSystem.numberOfBatteries}`);
  console.log(`Total power stored: ${powerSystem.totalPowerStored}`);

  const roomEntries = Object.entries(powerSystem.roomsReceivingPower);
  console.log(
    `Rooms receiving power: ${
      roomEntries.length === 0
        ? "none"
        : roomEntries.map(([room, demand]) => `${room} (${demand})`).join(", ")
    }`,
  );

  if (powerSystem.basicBatteryNames.length === 0) {
    console.log("Basic batteries: none");
    return;
  }

  console.log("Basic batteries:");

  for (const batteryName of powerSystem.basicBatteryNames) {
    const battery = state.basicBatteries[batteryName];

    if (!battery) {
      continue;
    }

    console.log(
      `- ${battery.name}: charge=${battery.chargeAmount}, charging=${
        battery.isCharging ? "yes" : "no"
      }, providing=${battery.providingEnergyTo ?? "nothing"}`,
    );
  }
}

function printAirlock(airlock: AirlockState): void {
  console.log("Airlock status");
  console.log(`Pressure level: ${airlock.pressureLevel}`);
  console.log(`Door status: ${airlock.doorStatus}`);
  console.log(`Sanitation: ${airlock.sanitation}`);
}

function printWaterRecycler(waterRecycler: WaterRecyclerState): void {
  console.log("Water recycler status");
  console.log(`Water capacity: ${waterRecycler.waterCapacity}`);
  console.log(`Cleanliness level: ${waterRecycler.cleanlinessLevel}`);
  console.log(`Filter condition: ${waterRecycler.filterCondition}`);
  console.log(`Filtration running: ${waterRecycler.filtrationRunning ? "yes" : "no"}`);
}

function printOxygenSystem(oxygenSystem: OxygenSystemState): void {
  console.log("Oxygen system status");
  console.log(`Oxygen level: ${oxygenSystem.oxygenLevel}`);
  console.log(`Air concentration: ${oxygenSystem.airConcentration}`);
}

program
  .name("habitat")
  .description("Manage persisted habitat systems and inspect their current state.")
  .version(packageJson.version)
  .showHelpAfterError()
  .addHelpText(
    "after",
    `
Examples:
  habitat greenhouse status
  habitat airlock open
  habitat basic-battery create battery-1 --charge 40 --charging true
  habitat power-system add-basic basic-battery central-grid battery-1
  habitat water-recycler show
  habitat oxygen-system fill-room lab

Notes:
  All commands read from and write to the local habitat-data.json file.
  Use "<command> --help" on any top-level object to discover its actions.
`,
  );

const greenhouseCommand = program
  .command("greenhouse")
  .description("Inspect and update the greenhouse environment and crops.");

greenhouseCommand.action(() => {
  greenhouseCommand.outputHelp();
});

greenhouseCommand.addHelpText(
  "after",
  `
Examples:
  habitat greenhouse status
  habitat greenhouse growing
  habitat greenhouse plant basil tomatoes
  habitat greenhouse adjust --temperature 25 --humidity 65
`,
);

greenhouseCommand
  .command("status")
  .description("Check the greenhouse room status.")
  .action(() => {
    const state = loadState();
    printGreenhouseStatus(state);
  });

const airlockCommand = program
  .command("airlock")
  .description("Open, close, sanitize, and inspect the airlock.");

airlockCommand.action(() => {
  airlockCommand.outputHelp();
});

airlockCommand.addHelpText(
  "after",
  `
Examples:
  habitat airlock open
  habitat airlock close
  habitat airlock sanitize
  habitat airlock check-pressure
`,
);

airlockCommand
  .command("open")
  .description("Open the airlock.")
  .action(() => {
    const state = loadState();
    state.airlock.doorStatus = "open";
    state.airlock.sanitation = "needs sanitation";
    saveState(state);
    console.log("Airlock opened.");
    printAirlock(state.airlock);
  });

airlockCommand
  .command("close")
  .description("Close the airlock.")
  .action(() => {
    const state = loadState();
    state.airlock.doorStatus = "closed";
    saveState(state);
    console.log("Airlock closed.");
    printAirlock(state.airlock);
  });

airlockCommand
  .command("sanitize")
  .description("Sanitize the airlock.")
  .action(() => {
    const state = loadState();
    state.airlock.sanitation = "clean";
    saveState(state);
    console.log("Airlock sanitized.");
    printAirlock(state.airlock);
  });

airlockCommand
  .command("check-pressure")
  .description("Check the airlock pressure level.")
  .action(() => {
    const state = loadState();
    console.log(`Airlock pressure level: ${state.airlock.pressureLevel}`);
  });

const waterRecyclerCommand = program
  .command("water-recycler")
  .description("Start, stop, and inspect the water recycler.");

waterRecyclerCommand.action(() => {
  waterRecyclerCommand.outputHelp();
});

waterRecyclerCommand.addHelpText(
  "after",
  `
Examples:
  habitat water-recycler show
  habitat water-recycler start-filtration
  habitat water-recycler stop-filtration
`,
);

waterRecyclerCommand
  .command("show")
  .description("Show the water recycler status.")
  .action(() => {
    const state = loadState();
    printWaterRecycler(state.waterRecycler);
  });

waterRecyclerCommand
  .command("start-filtration")
  .description("Start water filtration.")
  .action(() => {
    const state = loadState();
    state.waterRecycler.filtrationRunning = true;
    state.waterRecycler.cleanlinessLevel = Math.min(
      100,
      state.waterRecycler.cleanlinessLevel + 10,
    );
    state.waterRecycler.filterCondition =
      state.waterRecycler.cleanlinessLevel >= 90 ? "used" : "good";
    saveState(state);
    console.log("Water filtration started.");
    printWaterRecycler(state.waterRecycler);
  });

waterRecyclerCommand
  .command("stop-filtration")
  .description("Stop water filtration.")
  .action(() => {
    const state = loadState();
    state.waterRecycler.filtrationRunning = false;
    saveState(state);
    console.log("Water filtration stopped.");
    printWaterRecycler(state.waterRecycler);
  });

const oxygenSystemCommand = program
  .command("oxygen-system")
  .description("Fill rooms with oxygen, generate oxygen, and inspect oxygen state.");

oxygenSystemCommand.action(() => {
  oxygenSystemCommand.outputHelp();
});

oxygenSystemCommand.addHelpText(
  "after",
  `
Examples:
  habitat oxygen-system show
  habitat oxygen-system fill-room lab
  habitat oxygen-system generate
  habitat oxygen-system level
`,
);

oxygenSystemCommand
  .command("show")
  .description("Show the oxygen system status.")
  .action(() => {
    const state = loadState();
    printOxygenSystem(state.oxygenSystem);
  });

oxygenSystemCommand
  .command("fill-room")
  .description("Fill a room with oxygen.")
  .argument("<room>", "Room name")
  .action((room: string) => {
    const state = loadState();
    state.oxygenSystem.oxygenLevel = Math.max(0, state.oxygenSystem.oxygenLevel - 5);
    state.oxygenSystem.airConcentration = `focused on ${room}`;
    saveState(state);
    console.log(`Filled ${room} with oxygen.`);
    printOxygenSystem(state.oxygenSystem);
  });

oxygenSystemCommand
  .command("generate")
  .description("Generate more oxygen from water.")
  .action(() => {
    const state = loadState();
    state.oxygenSystem.oxygenLevel = Math.min(100, state.oxygenSystem.oxygenLevel + 15);
    state.oxygenSystem.airConcentration = "oxygen-rich";
    state.waterRecycler.waterCapacity = Math.max(0, state.waterRecycler.waterCapacity - 5);
    saveState(state);
    console.log("Generated more oxygen from water.");
    printOxygenSystem(state.oxygenSystem);
  });

oxygenSystemCommand
  .command("level")
  .description("Get the current oxygen level.")
  .action(() => {
    const state = loadState();
    console.log(`Current oxygen level: ${state.oxygenSystem.oxygenLevel}`);
  });

greenhouseCommand
  .command("growing")
  .description("See what is growing in the greenhouse room.")
  .action(() => {
    const state = loadState();
    const growingEntries = Object.entries(state.greenhouse.growing);

    if (growingEntries.length === 0) {
      console.log("Nothing is growing in the greenhouse yet.");
      return;
    }

    console.log("Currently growing:");
    for (const [crop, count] of growingEntries) {
      console.log(`- ${crop} x${count}`);
    }
  });

greenhouseCommand
  .command("plant")
  .description("Plant one or more things in the greenhouse room.")
  .argument("<names...>", "What to plant")
  .action((names: string[]) => {
    const state = loadState();
    const addedPlants: Record<string, number> = {};

    for (const name of names) {
      const normalizedName = name.trim();

      if (!normalizedName) {
        continue;
      }

      state.greenhouse.growing[normalizedName] = (state.greenhouse.growing[normalizedName] ?? 0) + 1;
      addedPlants[normalizedName] = (addedPlants[normalizedName] ?? 0) + 1;
    }

    if (Object.keys(addedPlants).length === 0) {
      console.log("No plants were added.");
      return;
    }

    saveState(state);
    console.log(`Planted: ${formatGrowing(addedPlants)}`);
  });

greenhouseCommand
  .command("adjust")
  .description("Adjust greenhouse conditions.")
  .option("--temperature <value>", "Set temperature in C", Number)
  .option("--humidity <value>", "Set humidity percentage", Number)
  .option("--air-composition <value>", "Set air composition")
  .option("--light-level <value>", "Set light level", Number)
  .option("--integrity <value>", "Set structural integrity percentage", Number)
  .action((options) => {
    const state = loadState();
    const greenhouse = state.greenhouse;
    let hasChanges = false;

    if (typeof options.temperature === "number" && !Number.isNaN(options.temperature)) {
      greenhouse.temperature = options.temperature;
      hasChanges = true;
    }

    if (typeof options.humidity === "number" && !Number.isNaN(options.humidity)) {
      greenhouse.humidity = options.humidity;
      hasChanges = true;
    }

    if (typeof options.airComposition === "string") {
      greenhouse.airComposition = options.airComposition;
      hasChanges = true;
    }

    if (typeof options.lightLevel === "number" && !Number.isNaN(options.lightLevel)) {
      greenhouse.lightLevel = options.lightLevel;
      hasChanges = true;
    }

    if (typeof options.integrity === "number" && !Number.isNaN(options.integrity)) {
      greenhouse.integrity = options.integrity;
      hasChanges = true;
    }

    if (!hasChanges) {
      console.log("No adjustments were provided.");
      return;
    }

    saveState(state);
    console.log("Greenhouse conditions updated.");
    printGreenhouseStatus(state);
  });

const basicBatteryCommand = program
  .command("basic-battery")
  .description("Create, inspect, update, and delete persisted basic-battery objects.");

basicBatteryCommand.action(() => {
  basicBatteryCommand.outputHelp();
});

basicBatteryCommand.addHelpText(
  "after",
  `
Examples:
  habitat basic-battery create battery-1 --charge 40 --charging true --providing-to greenhouse
  habitat basic-battery show battery-1
  habitat basic-battery update battery-1 --charge 55 --charging false
  habitat basic-battery delete battery-1
`,
);

basicBatteryCommand
  .command("create")
  .description("Create a basic-battery.")
  .argument("<name>", "Battery name")
  .option("--charge <value>", "Charge amount", Number)
  .option("--charging <value>", 'Whether the battery is charging: "true" or "false"', parseBoolean)
  .option("--providing-to <value>", "Where the battery is providing energy to")
  .action((name: string, options) => {
    const state = loadState();

    if (state.basicBatteries[name]) {
      console.log(`A basic-battery named "${name}" already exists.`);
      process.exitCode = 1;
      return;
    }

    state.basicBatteries[name] = {
      name,
      chargeAmount:
        typeof options.charge === "number" && !Number.isNaN(options.charge) ? options.charge : 0,
      isCharging: typeof options.charging === "boolean" ? options.charging : false,
      providingEnergyTo:
        typeof options.providingTo === "string" && options.providingTo.trim()
          ? options.providingTo
          : null,
      powerSystemName: null,
    };

    saveState(state);
    console.log(`Created basic-battery "${name}".`);
    printBasicBattery(state.basicBatteries[name]);
  });

basicBatteryCommand
  .command("show")
  .description("Show a basic-battery.")
  .argument("<name>", "Battery name")
  .action((name: string) => {
    const state = loadState();
    const battery = state.basicBatteries[name];

    if (!battery) {
      console.log(`No basic-battery named "${name}" was found.`);
      process.exitCode = 1;
      return;
    }

    printBasicBattery(battery);
  });

basicBatteryCommand
  .command("update")
  .description("Update a basic-battery.")
  .argument("<name>", "Battery name")
  .option("--charge <value>", "Charge amount", Number)
  .option("--charging <value>", 'Whether the battery is charging: "true" or "false"', parseBoolean)
  .option("--providing-to <value>", "Where the battery is providing energy to")
  .option("--clear-providing-to", "Clear where the battery is providing energy")
  .action((name: string, options) => {
    const state = loadState();
    const battery = state.basicBatteries[name];

    if (!battery) {
      console.log(`No basic-battery named "${name}" was found.`);
      process.exitCode = 1;
      return;
    }

    let hasChanges = false;

    if (typeof options.charge === "number" && !Number.isNaN(options.charge)) {
      battery.chargeAmount = options.charge;
      hasChanges = true;
    }

    if (typeof options.charging === "boolean") {
      battery.isCharging = options.charging;
      hasChanges = true;
    }

    if (typeof options.providingTo === "string") {
      battery.providingEnergyTo = options.providingTo;
      hasChanges = true;
    }

    if (options.clearProvidingTo) {
      battery.providingEnergyTo = null;
      hasChanges = true;
    }

    if (!hasChanges) {
      console.log("No updates were provided.");
      return;
    }

    if (battery.powerSystemName) {
      syncPowerSystem(state, battery.powerSystemName);
    }

    saveState(state);
    console.log(`Updated basic-battery "${name}".`);
    printBasicBattery(battery);
  });

basicBatteryCommand
  .command("delete")
  .description("Delete a basic-battery.")
  .argument("<name>", "Battery name")
  .action((name: string) => {
    const state = loadState();
    const battery = state.basicBatteries[name];

    if (!battery) {
      console.log(`No basic-battery named "${name}" was found.`);
      process.exitCode = 1;
      return;
    }

    const attachedPowerSystemName = battery.powerSystemName;
    delete state.basicBatteries[name];

    if (attachedPowerSystemName) {
      syncPowerSystem(state, attachedPowerSystemName);
    }

    saveState(state);
    console.log(`Deleted basic-battery "${name}".`);
  });

const powerSystemCommand = program
  .command("power-system")
  .description("Create, inspect, update, and wire together persisted power-system objects.");

powerSystemCommand.action(() => {
  powerSystemCommand.outputHelp();
});

powerSystemCommand.addHelpText(
  "after",
  `
Examples:
  habitat power-system create central-grid --room greenhouse:20 --room lab:35
  habitat power-system show central-grid
  habitat power-system update central-grid --room quarters:10
  habitat power-system add-basic basic-battery central-grid battery-1
`,
);

powerSystemCommand
  .command("create")
  .description("Create a power-system.")
  .argument("<name>", "Power system name")
  .option("--room <room:demand>", "Room receiving power and demanded amount", collectValues, [])
  .action((name: string, options) => {
    const state = loadState();

    if (state.powerSystems[name]) {
      console.log(`A power-system named "${name}" already exists.`);
      process.exitCode = 1;
      return;
    }

    state.powerSystems[name] = {
      name,
      basicBatteryNames: [],
      numberOfBatteries: 0,
      totalPowerStored: 0,
      roomsReceivingPower: parseRoomDemandEntries(options.room),
    };

    saveState(state);
    console.log(`Created power-system "${name}".`);
    printPowerSystem(state, state.powerSystems[name]);
  });

powerSystemCommand
  .command("show")
  .description("Show a power-system.")
  .argument("<name>", "Power system name")
  .action((name: string) => {
    const state = loadState();
    const powerSystem = state.powerSystems[name];

    if (!powerSystem) {
      console.log(`No power-system named "${name}" was found.`);
      process.exitCode = 1;
      return;
    }

    syncPowerSystem(state, name);
    printPowerSystem(state, powerSystem);
  });

powerSystemCommand
  .command("update")
  .description("Update a power-system.")
  .argument("<name>", "Power system name")
  .option("--room <room:demand>", "Replace or add a room demand", collectValues, [])
  .option("--clear-rooms", "Clear all room demand entries")
  .action((name: string, options) => {
    const state = loadState();
    const powerSystem = state.powerSystems[name];

    if (!powerSystem) {
      console.log(`No power-system named "${name}" was found.`);
      process.exitCode = 1;
      return;
    }

    let hasChanges = false;

    if (options.clearRooms) {
      powerSystem.roomsReceivingPower = {};
      hasChanges = true;
    }

    if (Array.isArray(options.room) && options.room.length > 0) {
      powerSystem.roomsReceivingPower = {
        ...powerSystem.roomsReceivingPower,
        ...parseRoomDemandEntries(options.room),
      };
      hasChanges = true;
    }

    if (!hasChanges) {
      console.log("No updates were provided.");
      return;
    }

    syncPowerSystem(state, name);
    saveState(state);
    console.log(`Updated power-system "${name}".`);
    printPowerSystem(state, powerSystem);
  });

powerSystemCommand
  .command("delete")
  .description("Delete a power-system.")
  .argument("<name>", "Power system name")
  .action((name: string) => {
    const state = loadState();
    const powerSystem = state.powerSystems[name];

    if (!powerSystem) {
      console.log(`No power-system named "${name}" was found.`);
      process.exitCode = 1;
      return;
    }

    for (const batteryName of powerSystem.basicBatteryNames) {
      const battery = state.basicBatteries[batteryName];

      if (battery) {
        battery.powerSystemName = null;
      }
    }

    delete state.powerSystems[name];
    saveState(state);
    console.log(`Deleted power-system "${name}".`);
  });

const addBasicCommand = powerSystemCommand
  .command("add-basic")
  .description("Attach a basic object to a power-system.");

addBasicCommand
  .command("basic-battery")
  .description("Attach a basic-battery to a power-system.")
  .argument("<powerSystemName>", "Power system name")
  .argument("<basicBatteryName>", "Basic battery name")
  .action((powerSystemName: string, basicBatteryName: string) => {
    const state = loadState();
    const powerSystem = state.powerSystems[powerSystemName];
    const battery = state.basicBatteries[basicBatteryName];

    if (!powerSystem) {
      console.log(`No power-system named "${powerSystemName}" was found.`);
      process.exitCode = 1;
      return;
    }

    if (!battery) {
      console.log(`No basic-battery named "${basicBatteryName}" was found.`);
      process.exitCode = 1;
      return;
    }

    const previousPowerSystemName = battery.powerSystemName;
    battery.powerSystemName = powerSystemName;

    if (!powerSystem.basicBatteryNames.includes(basicBatteryName)) {
      powerSystem.basicBatteryNames.push(basicBatteryName);
    }

    if (previousPowerSystemName && previousPowerSystemName !== powerSystemName) {
      syncPowerSystem(state, previousPowerSystemName);
    }

    syncPowerSystem(state, powerSystemName);
    saveState(state);
    console.log(
      `Attached basic-battery "${basicBatteryName}" to power-system "${powerSystemName}".`,
    );
    printPowerSystem(state, powerSystem);
  });

program.action(() => {
  program.outputHelp();
});

program.parse(process.argv);
