import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");
const habitatDirPath = path.join(workspaceRoot, ".habitat");
const registrationFilePath = path.join(habitatDirPath, "registration.json");
const blueprintsFilePath = path.join(habitatDirPath, "blueprints.json");
const modulesFilePath = path.join(habitatDirPath, "modules.json");

export type RegistrationResponse = {
  habitatId: string;
  starterModules: StarterModuleInstance[];
  blueprints: ProductionBlueprint[];
};

export type HabitatRecord = {
  id: string;
  habitatSlug: string;
  displayName: string;
  catalogVersion: string;
  status: string;
  lastSeenAt?: string | null;
};

export type HabitatResponse = {
  habitat: HabitatRecord;
};

export type LocalRegistration = {
  habitatId: string;
  habitatUuid: string;
  displayName: string;
  baseUrl: string;
  registeredAt: string;
};

export type StarterModuleInstance = {
  id: string;
  blueprintId: string;
  displayName: string;
  connectedTo: string[];
  runtimeAttributes: Record<string, unknown>;
  capabilities: string[];
};

export type ProductionBlueprint = {
  id?: string;
  blueprintId: string;
  displayName: string;
  output?: {
    moduleType?: string;
    [key: string]: unknown;
  };
  runtimeAttributes?: Record<string, unknown>;
  capabilities?: string[];
  [key: string]: unknown;
};

export type BlueprintCatalogResponse = {
  catalogVersion: string;
  blueprints: ProductionBlueprint[];
};

export type BlueprintResponse = {
  blueprint: ProductionBlueprint;
};

export type IndustryResource = {
  id: string;
  resourceType: string;
  displayName: string;
  kind: string;
  rarity: string;
  description?: string;
  unit?: string;
};

export type ResourceCatalogResponse = {
  catalogVersion: string;
  resources: IndustryResource[];
};

export type BlueprintIndex = Record<string, ProductionBlueprint>;

export type LocalModule = {
  id: string;
  blueprintId: string;
  moduleType: string | null;
  sourceStarterModuleId?: string;
  displayName: string;
  connectedTo: string[];
  runtimeAttributes: Record<string, unknown>;
  capabilities: string[];
};

export type ModuleIndex = Record<string, LocalModule>;

export type PowerTickBatterySummary = {
  moduleId: string;
  drainedKw: number;
  remainingChargeKw: number;
};

export type PowerTickSummary = {
  totalDemandKw: number;
  totalDrainedKw: number;
  shortfallKw: number;
  batteriesUsed: PowerTickBatterySummary[];
};

export type PowerTickRunSummary = PowerTickSummary & {
  tickCount: number;
};

export const allowedModuleStatuses = [
  "offline",
  "idle",
  "online",
  "active",
  "damaged",
] as const;

export type ModuleRuntimeStatus = (typeof allowedModuleStatuses)[number];

function ensureHabitatDir(): void {
  mkdirSync(habitatDirPath, { recursive: true });
}

function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) {
    return null;
  }

  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function writeJsonFile(filePath: string, value: unknown): void {
  ensureHabitatDir();
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function loadRegistration(): LocalRegistration | null {
  return readJsonFile<LocalRegistration>(registrationFilePath);
}

export function saveRegistration(registration: LocalRegistration): void {
  writeJsonFile(registrationFilePath, registration);
}

export function loadBlueprints(): BlueprintIndex {
  return readJsonFile<BlueprintIndex>(blueprintsFilePath) ?? {};
}

export function saveBlueprints(blueprints: BlueprintIndex): void {
  writeJsonFile(blueprintsFilePath, blueprints);
}

export function loadModules(): ModuleIndex {
  return readJsonFile<ModuleIndex>(modulesFilePath) ?? {};
}

export function saveModules(modules: ModuleIndex): void {
  writeJsonFile(modulesFilePath, modules);
}

export function deleteAllLocalState(): void {
  if (existsSync(habitatDirPath)) {
    rmSync(habitatDirPath, { recursive: true, force: true });
  }
}

export function indexBlueprints(blueprints: ProductionBlueprint[]): BlueprintIndex {
  const indexedBlueprints: BlueprintIndex = {};

  for (const blueprint of blueprints) {
    indexedBlueprints[blueprint.blueprintId] = blueprint;
  }

  return indexedBlueprints;
}

function slugifyModuleName(moduleName: string): string {
  return moduleName.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function buildSequentialModuleId(baseName: string, sequence: number): string {
  const slug = slugifyModuleName(baseName);
  return `${slug || "module"}-${sequence}`;
}

function getModuleBaseName(
  blueprintId: string,
  blueprint: ProductionBlueprint | undefined,
): string {
  return typeof blueprint?.output?.moduleType === "string" ? blueprint.output.moduleType : blueprintId;
}

function getNextModuleSequence(modules: ModuleIndex, baseName: string): number {
  const slug = slugifyModuleName(baseName);
  const pattern = new RegExp(`^${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`);
  let highestSequence = 0;

  for (const moduleId of Object.keys(modules)) {
    const match = moduleId.match(pattern);

    if (!match) {
      continue;
    }

    const sequence = Number(match[1]);

    if (!Number.isNaN(sequence)) {
      highestSequence = Math.max(highestSequence, sequence);
    }
  }

  return highestSequence + 1;
}

export function hydrateModulesFromStarterModules(
  starterModules: StarterModuleInstance[],
  blueprints: BlueprintIndex,
): ModuleIndex {
  const modules: ModuleIndex = {};
  const moduleCounts: Record<string, number> = {};

  for (const starterModule of starterModules) {
    const blueprint = blueprints[starterModule.blueprintId];
    const moduleType = getModuleBaseName(starterModule.blueprintId, blueprint);
    const moduleKey = slugifyModuleName(moduleType);
    const nextSequence = (moduleCounts[moduleKey] ?? 0) + 1;
    moduleCounts[moduleKey] = nextSequence;
    const moduleId = buildSequentialModuleId(moduleType, nextSequence);

    modules[moduleId] = {
      id: moduleId,
      blueprintId: starterModule.blueprintId,
      moduleType: typeof blueprint?.output?.moduleType === "string" ? blueprint.output.moduleType : null,
      sourceStarterModuleId: starterModule.id,
      displayName: starterModule.displayName,
      connectedTo: [...starterModule.connectedTo],
      runtimeAttributes: { ...starterModule.runtimeAttributes },
      capabilities: [...starterModule.capabilities],
    };
  }

  return modules;
}

export function createLocalModule(
  modules: ModuleIndex,
  blueprints: BlueprintIndex,
  blueprintId: string,
  displayName: string,
): LocalModule {
  const blueprint = blueprints[blueprintId];
  const moduleType = getModuleBaseName(blueprintId, blueprint);
  const moduleId = buildSequentialModuleId(
    moduleType,
    getNextModuleSequence(modules, moduleType),
  );

  return {
    id: moduleId,
    blueprintId,
    moduleType: typeof blueprint?.output?.moduleType === "string" ? blueprint.output.moduleType : null,
    displayName,
    connectedTo: [],
    runtimeAttributes: { ...(blueprint?.runtimeAttributes ?? {}) },
    capabilities: Array.isArray(blueprint?.capabilities) ? [...blueprint.capabilities] : [],
  };
}

export function parseRuntimeValue(rawValue: string): unknown {
  if (rawValue === "true") {
    return true;
  }

  if (rawValue === "false") {
    return false;
  }

  if (rawValue === "null") {
    return null;
  }

  const numericValue = Number(rawValue);

  if (!Number.isNaN(numericValue) && rawValue.trim() !== "") {
    return numericValue;
  }

  return rawValue;
}

export function parseRuntimeAssignment(assignment: string): { key: string; value: unknown } {
  const separatorIndex = assignment.indexOf("=");

  if (separatorIndex <= 0 || separatorIndex === assignment.length - 1) {
    throw new Error(`Invalid runtime assignment "${assignment}". Use key=value.`);
  }

  const key = assignment.slice(0, separatorIndex).trim();
  const rawValue = assignment.slice(separatorIndex + 1).trim();

  if (!key) {
    throw new Error(`Invalid runtime assignment "${assignment}". Key is required.`);
  }

  return {
    key,
    value: parseRuntimeValue(rawValue),
  };
}

export function disconnectDeletedModule(modules: ModuleIndex, deletedModuleId: string): ModuleIndex {
  const nextModules: ModuleIndex = {};

  for (const [moduleId, moduleRecord] of Object.entries(modules)) {
    if (moduleId === deletedModuleId) {
      continue;
    }

    nextModules[moduleId] = {
      ...moduleRecord,
      connectedTo: moduleRecord.connectedTo.filter(
        (connectedModuleId) => connectedModuleId !== deletedModuleId,
      ),
    };
  }

  return nextModules;
}

export function isModuleRuntimeStatus(value: string): value is ModuleRuntimeStatus {
  return (allowedModuleStatuses as readonly string[]).includes(value);
}

export function setModuleRuntimeStatus(
  modules: ModuleIndex,
  moduleId: string,
  status: ModuleRuntimeStatus,
): LocalModule {
  const moduleRecord = modules[moduleId];

  if (!moduleRecord) {
    throw new Error(`No local module named "${moduleId}" was found.`);
  }

  moduleRecord.runtimeAttributes.status = status;
  return moduleRecord;
}

function cloneModules(modules: ModuleIndex): ModuleIndex {
  const clonedModules: ModuleIndex = {};

  for (const [moduleId, moduleRecord] of Object.entries(modules)) {
    clonedModules[moduleId] = {
      ...moduleRecord,
      connectedTo: [...moduleRecord.connectedTo],
      runtimeAttributes: { ...moduleRecord.runtimeAttributes },
      capabilities: [...moduleRecord.capabilities],
    };
  }

  return clonedModules;
}

function readPositiveRuntimeNumber(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) {
    return 0;
  }

  return value;
}

export function getModulePowerDrawKw(moduleRecord: LocalModule): number {
  const powerDrawKw = moduleRecord.runtimeAttributes.powerDrawKw;

  if (typeof powerDrawKw === "number") {
    return readPositiveRuntimeNumber(powerDrawKw);
  }

  if (!powerDrawKw || typeof powerDrawKw !== "object" || Array.isArray(powerDrawKw)) {
    return 0;
  }

  const status = moduleRecord.runtimeAttributes.status;

  if (typeof status === "string") {
    return readPositiveRuntimeNumber(
      (powerDrawKw as Record<string, unknown>)[status],
    );
  }

  for (const fallbackStatus of ["active", "online", "damaged", "offline"]) {
    const fallbackValue = readPositiveRuntimeNumber(
      (powerDrawKw as Record<string, unknown>)[fallbackStatus],
    );

    if (fallbackValue > 0) {
      return fallbackValue;
    }
  }

  return 0;
}

function getBatteryStoredEnergyKw(moduleRecord: LocalModule): number {
  return readPositiveRuntimeNumber(moduleRecord.runtimeAttributes.currentEnergyKwh);
}

function setBatteryStoredEnergyKw(moduleRecord: LocalModule, value: number): void {
  moduleRecord.runtimeAttributes.currentEnergyKwh = value;
}

function isBatteryModule(moduleRecord: LocalModule): boolean {
  const moduleType = moduleRecord.moduleType ?? moduleRecord.blueprintId;
  return moduleType.includes("battery") || moduleRecord.blueprintId.includes("battery");
}

function getConnectedBatteryIds(modules: ModuleIndex): string[] {
  const batteryIds = new Set<string>();

  for (const [moduleId, moduleRecord] of Object.entries(modules)) {
    const powerDrawKw = getModulePowerDrawKw(moduleRecord);

    if (powerDrawKw <= 0) {
      continue;
    }

    for (const connectedModuleId of moduleRecord.connectedTo) {
      const connectedModule = modules[connectedModuleId];

      if (connectedModule && isBatteryModule(connectedModule)) {
        batteryIds.add(connectedModuleId);
      }
    }
  }

  return [...batteryIds].sort((left, right) => left.localeCompare(right));
}

function runSinglePowerTick(modules: ModuleIndex): {
  modules: ModuleIndex;
  summary: PowerTickSummary;
} {
  const nextModules = cloneModules(modules);
  const batteryIds = getConnectedBatteryIds(nextModules);
  const batteryChargeById = new Map<string, number>();
  const batterySummaries: PowerTickBatterySummary[] = [];

  for (const batteryId of batteryIds) {
    const chargeAmount = getBatteryStoredEnergyKw(nextModules[batteryId]);
    batteryChargeById.set(batteryId, chargeAmount);
  }

  const totalDemandKw = Object.values(nextModules).reduce((total, moduleRecord) => {
    return total + getModulePowerDrawKw(moduleRecord);
  }, 0);

  let remainingDemandKw = totalDemandKw;

  for (const batteryId of batteryIds) {
    if (remainingDemandKw <= 0) {
      break;
    }

    const currentChargeKw = batteryChargeById.get(batteryId) ?? 0;
    const drainedKw = Math.min(currentChargeKw, remainingDemandKw);
    const remainingChargeKw = currentChargeKw - drainedKw;

    batteryChargeById.set(batteryId, remainingChargeKw);
    setBatteryStoredEnergyKw(nextModules[batteryId], remainingChargeKw);
    remainingDemandKw -= drainedKw;
    batterySummaries.push({
      moduleId: batteryId,
      drainedKw,
      remainingChargeKw,
    });
  }

  const totalDrainedKw = totalDemandKw - remainingDemandKw;

  return {
    modules: nextModules,
    summary: {
      totalDemandKw,
      totalDrainedKw,
      shortfallKw: remainingDemandKw,
      batteriesUsed: batterySummaries,
    },
  };
}

export function runPowerTick(modules: ModuleIndex): {
  modules: ModuleIndex;
  summary: PowerTickSummary;
} {
  return runSinglePowerTick(modules);
}

export function runPowerTicks(
  modules: ModuleIndex,
  tickCount: number,
): {
  modules: ModuleIndex;
  summary: PowerTickRunSummary;
} {
  if (!Number.isInteger(tickCount) || tickCount <= 0) {
    throw new Error(`Tick count must be a positive integer. Received "${tickCount}".`);
  }

  let nextModules = modules;
  let totalDemandKw = 0;
  let totalDrainedKw = 0;
  let shortfallKw = 0;
  const batterySummaryById = new Map<string, PowerTickBatterySummary>();

  for (let index = 0; index < tickCount; index += 1) {
    const result = runSinglePowerTick(nextModules);
    nextModules = result.modules;
    totalDemandKw += result.summary.totalDemandKw;
    totalDrainedKw += result.summary.totalDrainedKw;
    shortfallKw += result.summary.shortfallKw;

    for (const batterySummary of result.summary.batteriesUsed) {
      batterySummaryById.set(batterySummary.moduleId, {
        moduleId: batterySummary.moduleId,
        drainedKw:
          (batterySummaryById.get(batterySummary.moduleId)?.drainedKw ?? 0) +
          batterySummary.drainedKw,
        remainingChargeKw: batterySummary.remainingChargeKw,
      });
    }
  }

  return {
    modules: nextModules,
    summary: {
      tickCount,
      totalDemandKw,
      totalDrainedKw,
      shortfallKw,
      batteriesUsed: [...batterySummaryById.values()].sort((left, right) =>
        left.moduleId.localeCompare(right.moduleId),
      ),
    },
  };
}

export function getHabitatDirPath(): string {
  return habitatDirPath;
}
