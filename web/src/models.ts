import type { ModuleRecord, SolarStatusResponse, TickResponse } from "./api";

export type BatteryCard = {
  id: string;
  name: string;
  currentEnergyKwh: number;
  capacityKwh: number;
  percentFull: number;
};

export type SolarArrayCard = {
  id: string;
  name: string;
  generationKw: number;
  status: string;
};

export type ModuleStatusCard = {
  id: string;
  name: string;
  status: string;
  powerDrawKw: number | null;
  availableStatuses: Array<"offline" | "online" | "active">;
};

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readStatus(moduleRecord: ModuleRecord): string {
  const value = moduleRecord.runtimeAttributes.status;
  return typeof value === "string" ? value : "unknown";
}

function getModuleIdentity(moduleRecord: ModuleRecord): string {
  return moduleRecord.moduleType ?? moduleRecord.blueprintId;
}

function isBatteryModule(moduleRecord: ModuleRecord): boolean {
  return /battery/i.test(getModuleIdentity(moduleRecord));
}

function isSolarArrayModule(moduleRecord: ModuleRecord): boolean {
  return getModuleIdentity(moduleRecord) === "small-solar-array";
}

export function getModulePowerDrawKw(moduleRecord: ModuleRecord): number | null {
  const powerDraw = moduleRecord.runtimeAttributes.powerDrawKw;

  if (typeof powerDraw === "number" && Number.isFinite(powerDraw) && powerDraw >= 0) {
    return powerDraw;
  }

  if (!powerDraw || typeof powerDraw !== "object" || Array.isArray(powerDraw)) {
    return null;
  }

  const status = readStatus(moduleRecord);
  const statusValue = readNumber((powerDraw as Record<string, unknown>)[status]);
  if (statusValue !== null) {
    return statusValue;
  }

  for (const fallbackStatus of ["active", "online", "damaged", "offline"]) {
    const fallbackValue = readNumber((powerDraw as Record<string, unknown>)[fallbackStatus]);
    if (fallbackValue !== null) {
      return fallbackValue;
    }
  }

  return null;
}

export function toBatteryCards(modules: ModuleRecord[]): BatteryCard[] {
  return modules
    .filter(isBatteryModule)
    .map((moduleRecord) => {
      const currentEnergyKwh = Math.max(0, readNumber(moduleRecord.runtimeAttributes.currentEnergyKwh) ?? 0);
      const capacityKwh = Math.max(0, readNumber(moduleRecord.runtimeAttributes.energyStorageKwh) ?? 0);
      const percentFull = capacityKwh > 0 ? Math.min(100, (currentEnergyKwh / capacityKwh) * 100) : 0;

      return {
        id: moduleRecord.id,
        name: moduleRecord.displayName,
        currentEnergyKwh,
        capacityKwh,
        percentFull,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function toSolarArrayCards(modules: ModuleRecord[]): SolarArrayCard[] {
  return modules
    .filter(isSolarArrayModule)
    .map((moduleRecord) => ({
      id: moduleRecord.id,
      name: moduleRecord.displayName,
      generationKw: Math.max(0, readNumber(moduleRecord.runtimeAttributes.powerGenerationKw) ?? 0),
      status: readStatus(moduleRecord),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function toModuleStatusCards(modules: ModuleRecord[]): ModuleStatusCard[] {
  return modules
    .map((moduleRecord) => ({
      id: moduleRecord.id,
      name: moduleRecord.displayName,
      status: readStatus(moduleRecord),
      powerDrawKw: getModulePowerDrawKw(moduleRecord),
      availableStatuses: ["offline", "online", "active"],
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function getCurrentConsumptionKw(modules: ModuleRecord[]): number {
  return modules.reduce((total, moduleRecord) => {
    return total + Math.max(0, getModulePowerDrawKw(moduleRecord) ?? 0);
  }, 0);
}

export function getCurrentGenerationKw(modules: ModuleRecord[]): number {
  return modules.reduce((total, moduleRecord) => {
    if (!isSolarArrayModule(moduleRecord)) {
      return total;
    }

    const status = readStatus(moduleRecord);
    if (status !== "online" && status !== "active") {
      return total;
    }

    return total + Math.max(0, readNumber(moduleRecord.runtimeAttributes.powerGenerationKw) ?? 0);
  }, 0);
}

export function getSolarBadgeTone(condition: SolarStatusResponse["solarIrradiance"]["condition"]): string {
  switch (condition) {
    case "clear":
      return "good";
    case "dusty":
      return "warn";
    case "storm":
    case "night":
      return "danger";
    default:
      return "neutral";
  }
}

export function getNetEnergyKwh(lastTickSummary: TickResponse["powerSummary"]): number {
  return lastTickSummary.solar.totalGeneratedEnergyKwh - lastTickSummary.totalEnergyDemandKwh;
}
