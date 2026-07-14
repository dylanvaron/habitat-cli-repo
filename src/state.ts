import { Database } from "bun:sqlite";
import { existsSync, readFileSync, renameSync, rmSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");
const databaseFilePath = path.join(workspaceRoot, "habitat.db");
const legacyHabitatDirPath = path.join(workspaceRoot, ".habitat");
const legacyDatabaseFilePath = path.join(legacyHabitatDirPath, "habitat.db");
const registrationFilePath = path.join(legacyHabitatDirPath, "registration.json");
const blueprintsFilePath = path.join(legacyHabitatDirPath, "blueprints.json");
const modulesFilePath = path.join(legacyHabitatDirPath, "modules.json");
const resourcesFilePath = path.join(legacyHabitatDirPath, "resources.json");
const buildsFilePath = path.join(legacyHabitatDirPath, "builds.json");
const legacyJsonFilePaths = [
  registrationFilePath,
  blueprintsFilePath,
  modulesFilePath,
  resourcesFilePath,
  buildsFilePath,
] as const;

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
    itemType?: string;
    moduleType?: string;
    quantity?: number;
    level?: number;
    [key: string]: unknown;
  };
  inputs?: Record<string, number>;
  buildTicks?: number;
  requiredFacility?: {
    moduleType?: string;
    minimumLevel?: number;
  };
  facilityLevel?: {
    moduleType?: string;
    from?: number;
    to?: number;
  };
  level?: number | null;
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

export type SolarIrradianceReading = {
  wPerM2: number;
  condition: string;
};

export type SolarIrradianceResponse = {
  solarIrradiance: SolarIrradianceReading;
};

export type WorldScanResponse = Record<string, unknown>;

export type ResourceInventory = Record<string, number>;

export type BlueprintIndex = Record<string, ProductionBlueprint>;

export type LocalModule = {
  id: string;
  blueprintId: string;
  moduleType: string | null;
  moduleLevel: number | null;
  sourceStarterModuleId?: string;
  displayName: string;
  connectedTo: string[];
  runtimeAttributes: Record<string, unknown>;
  capabilities: string[];
};

export type ModuleIndex = Record<string, LocalModule>;

export type LocalBuildRequiredFacility = {
  moduleType: string;
  minimumLevel: number | null;
};

export type LocalBuild = {
  id: string;
  blueprintId: string;
  displayName: string;
  moduleType: string | null;
  assignedFacilityModuleId?: string;
  status: "queued";
  requiredTicks: number;
  remainingTicks: number;
  startedAt: string;
  requiredFacility: LocalBuildRequiredFacility | null;
  consumedResources: Record<string, number>;
};

export type BuildIndex = Record<string, LocalBuild>;

export type PowerTickBatterySummary = {
  moduleId: string;
  drainedEnergyKwh: number;
  remainingEnergyKwh: number;
};

export type SolarTickArraySummary = {
  moduleId: string;
  generatedEnergyKwh: number;
};

export type SolarTickSummary = {
  irradianceWPerM2: number;
  totalGeneratedEnergyKwh: number;
  discardedEnergyKwh: number;
  arraysUsed: SolarTickArraySummary[];
};

export type PowerTickSummary = {
  totalPowerDrawKw: number;
  totalEnergyDemandKwh: number;
  totalEnergyDrainedKwh: number;
  energyShortfallKwh: number;
  batteriesUsed: PowerTickBatterySummary[];
  forcedOfflineModuleIds: string[];
  solar: SolarTickSummary;
};

export type PowerTickRunSummary = {
  tickCount: number;
  averagePowerDrawKw: number;
  totalEnergyDemandKwh: number;
  totalEnergyDrainedKwh: number;
  energyShortfallKwh: number;
  batteriesUsed: PowerTickBatterySummary[];
  forcedOfflineModuleIds: string[];
  solar: SolarTickSummary;
};

export type BuildCompletionSummary = {
  buildId: string;
  moduleId: string;
  displayName: string;
};

export type BuildCancellationSummary = {
  buildId: string;
  displayName: string;
  reason: string;
};

export type BuildTickSummary = {
  tickCount: number;
  advancedBuilds: number;
  completedBuilds: BuildCompletionSummary[];
  canceledBuilds: BuildCancellationSummary[];
};

export const allowedModuleStatuses = [
  "offline",
  "idle",
  "online",
  "active",
  "damaged",
] as const;

export type ModuleRuntimeStatus = (typeof allowedModuleStatuses)[number];

const batteryIdPattern = /battery/i;

function migrateLegacyDatabaseFile(): void {
  if (existsSync(databaseFilePath) || !existsSync(legacyDatabaseFilePath)) {
    return;
  }

  renameSync(legacyDatabaseFilePath, databaseFilePath);
}

function readLegacyJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) {
    return null;
  }

  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

let database: Database | null = null;

function getDatabase(): Database {
  if (database) {
    return database;
  }

  migrateLegacyDatabaseFile();
  database = new Database(databaseFilePath);
  database.exec(`
    CREATE TABLE IF NOT EXISTS state_entries (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  migrateLegacyJsonState(database);
  pruneLegacyJsonFiles();
  return database;
}

function migrateLegacyJsonState(db: Database): void {
  if (existsSync(databaseFilePath)) {
    const existingRow = db
      .query("SELECT 1 FROM state_entries LIMIT 1")
      .get() as { 1: number } | undefined;

    if (existingRow) {
      return;
    }
  }

  const legacyStateEntries = [
    ["registration", readLegacyJsonFile<LocalRegistration>(registrationFilePath)],
    ["blueprints", readLegacyJsonFile<BlueprintIndex>(blueprintsFilePath)],
    ["modules", readLegacyJsonFile<ModuleIndex>(modulesFilePath)],
    ["resources", readLegacyJsonFile<ResourceInventory>(resourcesFilePath)],
    ["builds", readLegacyJsonFile<BuildIndex>(buildsFilePath)],
  ] as const;

  const insertEntry = db.query(
    "INSERT OR REPLACE INTO state_entries (key, value) VALUES (?, ?)",
  );

  let migratedAnyEntry = false;

  for (const [key, value] of legacyStateEntries) {
    if (value === null) {
      continue;
    }

    insertEntry.run(key, JSON.stringify(value));
    migratedAnyEntry = true;
  }

  if (migratedAnyEntry) {
    return;
  }
}

function pruneLegacyJsonFiles(): void {
  for (const filePath of legacyJsonFilePaths) {
    if (!existsSync(filePath)) {
      continue;
    }

    unlinkSync(filePath);
  }
}

function loadStateEntry<T>(key: string): T | null {
  const row = getDatabase()
    .query("SELECT value FROM state_entries WHERE key = ?")
    .get(key) as { value: string } | undefined;

  if (!row) {
    return null;
  }

  return JSON.parse(row.value) as T;
}

function saveStateEntry(key: string, value: unknown): void {
  getDatabase()
    .query("INSERT OR REPLACE INTO state_entries (key, value) VALUES (?, ?)")
    .run(key, JSON.stringify(value));
}

export function loadRegistration(): LocalRegistration | null {
  return loadStateEntry<LocalRegistration>("registration");
}

export function saveRegistration(registration: LocalRegistration): void {
  saveStateEntry("registration", registration);
}

export function loadBlueprints(): BlueprintIndex {
  return loadStateEntry<BlueprintIndex>("blueprints") ?? {};
}

export function saveBlueprints(blueprints: BlueprintIndex): void {
  saveStateEntry("blueprints", blueprints);
}

export function loadModules(): ModuleIndex {
  return sanitizeModules(loadStateEntry<ModuleIndex>("modules") ?? {});
}

export function saveModules(modules: ModuleIndex): void {
  saveStateEntry("modules", sanitizeModules(modules));
}

export function loadResourceInventory(): ResourceInventory {
  return loadStateEntry<ResourceInventory>("resources") ?? {};
}

export function saveResourceInventory(resourceInventory: ResourceInventory): void {
  saveStateEntry("resources", resourceInventory);
}

export function loadBuilds(): BuildIndex {
  return loadStateEntry<BuildIndex>("builds") ?? {};
}

export function saveBuilds(builds: BuildIndex): void {
  saveStateEntry("builds", builds);
}

export function deleteAllLocalState(): void {
  if (database) {
    database.close(false);
    database = null;
  }

  if (existsSync(databaseFilePath)) {
    rmSync(databaseFilePath, { force: true });
  }

  if (existsSync(legacyHabitatDirPath)) {
    rmSync(legacyHabitatDirPath, { recursive: true, force: true });
  }
}

export function resetStateDatabaseConnection(): void {
  if (!database) {
    return;
  }

  database.close(false);
  database = null;
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

function getModuleLevelFromBlueprint(blueprint: ProductionBlueprint | undefined): number | null {
  if (!blueprint) {
    return null;
  }

  if (typeof blueprint.output?.level === "number") {
    return blueprint.output.level;
  }

  if (typeof blueprint.facilityLevel?.to === "number") {
    return blueprint.facilityLevel.to;
  }

  if (typeof blueprint.level === "number") {
    return blueprint.level;
  }

  return null;
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
      moduleLevel: getModuleLevelFromBlueprint(blueprint),
      sourceStarterModuleId: starterModule.id,
      displayName: starterModule.displayName,
      connectedTo: sanitizeConnections(starterModule.connectedTo),
      runtimeAttributes: { ...starterModule.runtimeAttributes },
      capabilities: [...starterModule.capabilities],
    };
  }

  return sanitizeModules(modules);
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
    moduleLevel: getModuleLevelFromBlueprint(blueprint),
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

  return sanitizeModules(nextModules);
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

export function addResourceToInventory(
  resourceInventory: ResourceInventory,
  resourceType: string,
  amount: number,
): ResourceInventory {
  const normalizedResourceType = resourceType.trim();

  if (!normalizedResourceType) {
    throw new Error("Resource type is required.");
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Resource amount must be a positive number. Received "${amount}".`);
  }

  return {
    ...resourceInventory,
    [normalizedResourceType]: (resourceInventory[normalizedResourceType] ?? 0) + amount,
  };
}

export function spendResourceInventory(
  resourceInventory: ResourceInventory,
  requiredResources: Record<string, number>,
): ResourceInventory {
  const nextInventory: ResourceInventory = { ...resourceInventory };

  for (const [resourceType, amount] of Object.entries(requiredResources)) {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error(`Invalid required amount for "${resourceType}".`);
    }

    const availableAmount = nextInventory[resourceType] ?? 0;

    if (availableAmount < amount) {
      throw new Error(
        `Not enough ${resourceType}. Need ${amount}, but only ${availableAmount} is available.`,
      );
    }

    const remainingAmount = availableAmount - amount;

    if (remainingAmount === 0) {
      delete nextInventory[resourceType];
    } else {
      nextInventory[resourceType] = remainingAmount;
    }
  }

  return nextInventory;
}

function buildSequentialBuildId(baseName: string, sequence: number): string {
  const slug = slugifyModuleName(baseName);
  return `${slug || "module"}-build-${sequence}`;
}

function getNextBuildSequence(builds: BuildIndex, baseName: string): number {
  const slug = slugifyModuleName(baseName);
  const pattern = new RegExp(
    `^${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-build-(\\d+)$`,
  );
  let highestSequence = 0;

  for (const buildId of Object.keys(builds)) {
    const match = buildId.match(pattern);

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

function getBlueprintOutputItemType(blueprint: ProductionBlueprint): string | null {
  return typeof blueprint.output?.itemType === "string" ? blueprint.output.itemType : null;
}

function getRequiredFacility(
  blueprint: ProductionBlueprint,
): LocalBuildRequiredFacility | null {
  if (typeof blueprint.requiredFacility?.moduleType !== "string") {
    return null;
  }

  return {
    moduleType: blueprint.requiredFacility.moduleType,
    minimumLevel:
      typeof blueprint.requiredFacility.minimumLevel === "number"
        ? blueprint.requiredFacility.minimumLevel
        : null,
  };
}

function isWorkshopFabricatorModule(moduleRecord: LocalModule): boolean {
  const moduleType = moduleRecord.moduleType ?? moduleRecord.blueprintId;
  return moduleType === "workshop-fabricator";
}

function isWorkshopFacilityBuild(buildRecord: LocalBuild): boolean {
  return buildRecord.requiredFacility?.moduleType === "workshop-fabricator";
}

function deleteModuleCurrentJobId(moduleRecord: LocalModule): void {
  delete moduleRecord.runtimeAttributes.currentJobId;
}

function setModuleCurrentJobId(moduleRecord: LocalModule, buildId: string): void {
  moduleRecord.runtimeAttributes.currentJobId = buildId;
}

function getActiveWorkshopFabricatorIds(
  modules: ModuleIndex,
  minimumLevel: number,
): string[] {
  return Object.values(modules)
    .filter((moduleRecord) => {
      const moduleLevel = moduleRecord.moduleLevel ?? 1;
      return (
        isWorkshopFabricatorModule(moduleRecord) &&
        moduleLevel >= minimumLevel &&
        moduleRecord.runtimeAttributes.status === "active"
      );
    })
    .map((moduleRecord) => moduleRecord.id)
    .sort((left, right) => left.localeCompare(right));
}

export function validateBlueprintCanBuildAsModule(
  blueprints: BlueprintIndex,
  blueprintId: string,
): ProductionBlueprint {
  const blueprint = blueprints[blueprintId];

  if (!blueprint) {
    throw new Error(
      `No cached blueprint named "${blueprintId}" was found. Register first or use a cached blueprint ID.`,
    );
  }

  if (getBlueprintOutputItemType(blueprint) !== "module") {
    throw new Error(
      `Blueprint "${blueprintId}" cannot be built with \`habitat construct\` because it does not output a module.`,
    );
  }

  return blueprint;
}

export function validateBuildFacilityRequirement(
  modules: ModuleIndex,
  blueprint: ProductionBlueprint,
): void {
  const requiredFacility = getRequiredFacility(blueprint);

  if (!requiredFacility) {
    return;
  }

  const minimumLevel = requiredFacility.minimumLevel ?? 1;
  const matchingFacilities = Object.values(modules).filter((moduleRecord) => {
    const moduleType = moduleRecord.moduleType ?? moduleRecord.blueprintId;
    const moduleLevel = moduleRecord.moduleLevel ?? 1;
    return moduleType === requiredFacility.moduleType && moduleLevel >= minimumLevel;
  });

  if (matchingFacilities.length === 0) {
    throw new Error(
      `Building "${blueprint.blueprintId}" requires a ${requiredFacility.moduleType} at level ${minimumLevel} or higher.`,
    );
  }

  if (requiredFacility.moduleType === "workshop-fabricator") {
    const hasActiveWorkshopFabricator = matchingFacilities.some((moduleRecord) => {
      return moduleRecord.runtimeAttributes.status === "active";
    });

    if (!hasActiveWorkshopFabricator) {
      throw new Error(
        `Building "${blueprint.blueprintId}" requires a workshop-fabricator at level ${minimumLevel} or higher that is set to "active".`,
      );
    }
  }
}

export function validateSupplyCacheOnline(modules: ModuleIndex): void {
  const hasOnlineSupplyCache = Object.values(modules).some((moduleRecord) => {
    const moduleType = moduleRecord.moduleType ?? moduleRecord.blueprintId;
    return moduleType === "supply-cache" && moduleRecord.runtimeAttributes.status === "online";
  });

  if (!hasOnlineSupplyCache) {
    throw new Error(
      'Starting a module build requires at least one supply-cache to be set to "online".',
    );
  }
}

export function synchronizeWorkshopAssignments(
  modules: ModuleIndex,
  builds: BuildIndex,
): void {
  for (const moduleRecord of Object.values(modules)) {
    if (isWorkshopFabricatorModule(moduleRecord)) {
      deleteModuleCurrentJobId(moduleRecord);
    }
  }

  const occupiedModuleIds = new Set<string>();
  const workshopBuilds = Object.values(builds)
    .filter((buildRecord) => isWorkshopFacilityBuild(buildRecord))
    .sort((left, right) => left.id.localeCompare(right.id));

  for (const buildRecord of workshopBuilds) {
    const minimumLevel = buildRecord.requiredFacility?.minimumLevel ?? 1;
    const assignedModuleId = buildRecord.assignedFacilityModuleId;

    if (!assignedModuleId) {
      continue;
    }

    const moduleRecord = modules[assignedModuleId];

    if (
      !moduleRecord ||
      !isWorkshopFabricatorModule(moduleRecord) ||
      (moduleRecord.moduleLevel ?? 1) < minimumLevel ||
      moduleRecord.runtimeAttributes.status !== "active" ||
      occupiedModuleIds.has(assignedModuleId)
    ) {
      delete buildRecord.assignedFacilityModuleId;
      continue;
    }

    occupiedModuleIds.add(assignedModuleId);
    setModuleCurrentJobId(moduleRecord, buildRecord.id);
  }

  for (const buildRecord of workshopBuilds) {
    if (buildRecord.assignedFacilityModuleId) {
      continue;
    }

    const minimumLevel = buildRecord.requiredFacility?.minimumLevel ?? 1;
    const availableModuleId = getActiveWorkshopFabricatorIds(modules, minimumLevel).find(
      (moduleId) => !occupiedModuleIds.has(moduleId),
    );

    if (!availableModuleId) {
      continue;
    }

    buildRecord.assignedFacilityModuleId = availableModuleId;
    occupiedModuleIds.add(availableModuleId);
    setModuleCurrentJobId(modules[availableModuleId], buildRecord.id);
  }
}

export function validateBuildFacilityAvailability(
  modules: ModuleIndex,
  builds: BuildIndex,
  blueprint: ProductionBlueprint,
): void {
  const requiredFacility = getRequiredFacility(blueprint);

  if (!requiredFacility || requiredFacility.moduleType !== "workshop-fabricator") {
    return;
  }

  synchronizeWorkshopAssignments(modules, builds);

  const minimumLevel = requiredFacility.minimumLevel ?? 1;
  const activeWorkshopFabricators = getActiveWorkshopFabricatorIds(modules, minimumLevel);
  const queuedWorkshopBuilds = Object.values(builds).filter((buildRecord) =>
    isWorkshopFacilityBuild(buildRecord),
  );

  if (queuedWorkshopBuilds.length >= activeWorkshopFabricators.length) {
    throw new Error(
      `All active workshop-fabricators are already busy. Finish a queued workshop build before starting "${blueprint.blueprintId}".`,
    );
  }
}

export function assignBuildFacility(
  modules: ModuleIndex,
  buildRecord: LocalBuild,
): string | null {
  if (!isWorkshopFacilityBuild(buildRecord)) {
    return null;
  }

  const minimumLevel = buildRecord.requiredFacility?.minimumLevel ?? 1;
  const availableModuleId = getActiveWorkshopFabricatorIds(modules, minimumLevel).find(
    (moduleId) => {
      const moduleRecord = modules[moduleId];
      return typeof moduleRecord.runtimeAttributes.currentJobId !== "string";
    },
  );

  if (!availableModuleId) {
    return null;
  }

  buildRecord.assignedFacilityModuleId = availableModuleId;
  setModuleCurrentJobId(modules[availableModuleId], buildRecord.id);
  return availableModuleId;
}

export function createLocalBuild(
  builds: BuildIndex,
  blueprint: ProductionBlueprint,
  displayName: string,
): LocalBuild {
  const moduleType = getModuleBaseName(blueprint.blueprintId, blueprint);
  const requiredTicks =
    typeof blueprint.buildTicks === "number" && blueprint.buildTicks > 0 ? blueprint.buildTicks : 1;

  return {
    id: buildSequentialBuildId(moduleType, getNextBuildSequence(builds, moduleType)),
    blueprintId: blueprint.blueprintId,
    displayName,
    moduleType: typeof blueprint.output?.moduleType === "string" ? blueprint.output.moduleType : null,
    status: "queued",
    requiredTicks,
    remainingTicks: requiredTicks,
    startedAt: new Date().toISOString(),
    requiredFacility: getRequiredFacility(blueprint),
    consumedResources: { ...(blueprint.inputs ?? {}) },
  };
}

export function cancelLocalBuild(
  modules: ModuleIndex,
  builds: BuildIndex,
  buildId: string,
  reason = "manually cancel",
): {
  modules: ModuleIndex;
  builds: BuildIndex;
  canceledBuild: LocalBuild;
  reason: string;
} {
  const buildRecord = builds[buildId];

  if (!buildRecord) {
    throw new Error(`No local build named "${buildId}" was found.`);
  }

  const nextModules = cloneModules(modules);
  const nextBuilds = cloneBuilds(builds);
  const canceledBuild = nextBuilds[buildId];

  delete nextBuilds[buildId];
  synchronizeWorkshopAssignments(nextModules, nextBuilds);

  return {
    modules: nextModules,
    builds: nextBuilds,
    canceledBuild,
    reason,
  };
}

export function cancelBuildsForForcedOfflineModules(
  modules: ModuleIndex,
  builds: BuildIndex,
  forcedOfflineModuleIds: string[],
): {
  modules: ModuleIndex;
  builds: BuildIndex;
  canceledBuilds: BuildCancellationSummary[];
} {
  let nextModules = cloneModules(modules);
  let nextBuilds = cloneBuilds(builds);
  const canceledBuilds: BuildCancellationSummary[] = [];
  const forcedOfflineModuleIdSet = new Set(forcedOfflineModuleIds);

  const buildIdsToCancel = Object.values(nextBuilds)
    .filter((buildRecord) => {
      return (
        typeof buildRecord.assignedFacilityModuleId === "string" &&
        forcedOfflineModuleIdSet.has(buildRecord.assignedFacilityModuleId)
      );
    })
    .map((buildRecord) => buildRecord.id)
    .sort((left, right) => left.localeCompare(right));

  for (const buildId of buildIdsToCancel) {
    const result = cancelLocalBuild(
      nextModules,
      nextBuilds,
      buildId,
      "assigned workshop-fabricator forced offline",
    );
    nextModules = result.modules;
    nextBuilds = result.builds;
    canceledBuilds.push({
      buildId: result.canceledBuild.id,
      displayName: result.canceledBuild.displayName,
      reason: result.reason,
    });
  }

  return {
    modules: nextModules,
    builds: nextBuilds,
    canceledBuilds,
  };
}

function cloneModules(modules: ModuleIndex): ModuleIndex {
  const clonedModules: ModuleIndex = {};

  for (const [moduleId, moduleRecord] of Object.entries(modules)) {
    clonedModules[moduleId] = {
      ...moduleRecord,
      connectedTo: [...(moduleRecord.connectedTo ?? [])],
      runtimeAttributes: { ...moduleRecord.runtimeAttributes },
      capabilities: [...moduleRecord.capabilities],
    };
  }

  return sanitizeModules(clonedModules);
}

function cloneBuilds(builds: BuildIndex): BuildIndex {
  const clonedBuilds: BuildIndex = {};

  for (const [buildId, buildRecord] of Object.entries(builds)) {
    clonedBuilds[buildId] = {
      ...buildRecord,
      requiredFacility: buildRecord.requiredFacility ? { ...buildRecord.requiredFacility } : null,
      consumedResources: { ...buildRecord.consumedResources },
    };
  }

  return clonedBuilds;
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

function convertPowerKwToTickEnergyKwh(powerKw: number): number {
  return powerKw / 3600;
}

function getBatteryStoredEnergyKw(moduleRecord: LocalModule): number {
  return readPositiveRuntimeNumber(moduleRecord.runtimeAttributes.currentEnergyKwh);
}

function setBatteryStoredEnergyKw(moduleRecord: LocalModule, value: number): void {
  moduleRecord.runtimeAttributes.currentEnergyKwh = value;
}

function getBatteryStorageCapacityKwh(moduleRecord: LocalModule): number {
  return readPositiveRuntimeNumber(moduleRecord.runtimeAttributes.energyStorageKwh);
}

function isBatteryModule(moduleRecord: LocalModule): boolean {
  const moduleType = moduleRecord.moduleType ?? moduleRecord.blueprintId;
  return batteryIdPattern.test(moduleType) || batteryIdPattern.test(moduleRecord.blueprintId);
}

function isSmallSolarArrayModule(moduleRecord: LocalModule): boolean {
  const moduleType = moduleRecord.moduleType ?? moduleRecord.blueprintId;
  return moduleType === "small-solar-array";
}

function isBatteryChargeable(moduleRecord: LocalModule): boolean {
  return (
    moduleRecord.runtimeAttributes.status === "online" ||
    moduleRecord.runtimeAttributes.status === "active"
  );
}

function isSolarGeneratingStatus(moduleRecord: LocalModule): boolean {
  return (
    moduleRecord.runtimeAttributes.status === "online" ||
    moduleRecord.runtimeAttributes.status === "active"
  );
}

function getSolarArrayGenerationKw(moduleRecord: LocalModule): number {
  return readPositiveRuntimeNumber(moduleRecord.runtimeAttributes.powerGenerationKw);
}

function isBatteryModuleId(moduleId: string, modules: ModuleIndex): boolean {
  const moduleRecord = modules[moduleId];

  if (moduleRecord) {
    return isBatteryModule(moduleRecord);
  }

  return batteryIdPattern.test(moduleId);
}

function sanitizeConnections(
  connectedTo: string[],
  modules?: ModuleIndex,
): string[] {
  return connectedTo.filter((connectedModuleId) => {
    if (modules) {
      return !isBatteryModuleId(connectedModuleId, modules);
    }

    return !batteryIdPattern.test(connectedModuleId);
  });
}

function sanitizeModules(modules: ModuleIndex): ModuleIndex {
  const sanitizedModules: ModuleIndex = {};

  for (const [moduleId, moduleRecord] of Object.entries(modules)) {
    sanitizedModules[moduleId] = {
      ...moduleRecord,
      connectedTo: sanitizeConnections(moduleRecord.connectedTo ?? [], modules),
      runtimeAttributes: { ...moduleRecord.runtimeAttributes },
      capabilities: [...moduleRecord.capabilities],
    };
  }

  return sanitizedModules;
}

function getBatteryIds(modules: ModuleIndex): string[] {
  const batteryIds = Object.entries(modules)
    .filter(([, moduleRecord]) => isBatteryModule(moduleRecord))
    .map(([moduleId]) => moduleId)
    .sort((left, right) => left.localeCompare(right));

  return batteryIds;
}

function isForcedOfflineCandidate(moduleRecord: LocalModule): boolean {
  return (
    moduleRecord.runtimeAttributes.status === "online" ||
    moduleRecord.runtimeAttributes.status === "active"
  );
}

function getModuleDemandEntries(modules: ModuleIndex): Array<{
  moduleId: string;
  energyDemandKwh: number;
  isForcedOfflineCandidate: boolean;
}> {
  return Object.entries(modules)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([moduleId, moduleRecord]) => {
      return {
        moduleId,
        energyDemandKwh: convertPowerKwToTickEnergyKwh(getModulePowerDrawKw(moduleRecord)),
        isForcedOfflineCandidate: isForcedOfflineCandidate(moduleRecord),
      };
    })
    .filter((entry) => entry.energyDemandKwh > 0);
}

function applyBatteryDrain(
  modules: ModuleIndex,
  batteryIds: string[],
  energyToDrainKwh: number,
): PowerTickBatterySummary[] {
  let remainingEnergyToDrainKwh = energyToDrainKwh;
  const batterySummaries: PowerTickBatterySummary[] = [];

  for (const batteryId of batteryIds) {
    const currentEnergyKwh = getBatteryStoredEnergyKw(modules[batteryId]);
    const drainedEnergyKwh = Math.min(currentEnergyKwh, remainingEnergyToDrainKwh);
    const remainingEnergyKwh = currentEnergyKwh - drainedEnergyKwh;

    setBatteryStoredEnergyKw(modules[batteryId], remainingEnergyKwh);
    remainingEnergyToDrainKwh -= drainedEnergyKwh;
    batterySummaries.push({
      moduleId: batteryId,
      drainedEnergyKwh,
      remainingEnergyKwh,
    });
  }

  return batterySummaries;
}

function applySolarGeneration(
  modules: ModuleIndex,
  batteryIds: string[],
  irradianceWPerM2: number,
): SolarTickSummary {
  const solarMultiplier = irradianceWPerM2 / 900;
  const solarEfficiency = 0.5;
  const arraysUsed: SolarTickArraySummary[] = [];
  let totalGeneratedEnergyKwh = 0;

  for (const [moduleId, moduleRecord] of Object.entries(modules).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (!isSmallSolarArrayModule(moduleRecord) || !isSolarGeneratingStatus(moduleRecord)) {
      continue;
    }

    const powerGenerationKw = getSolarArrayGenerationKw(moduleRecord);
    const generatedEnergyKwh =
      powerGenerationKw * solarMultiplier * solarEfficiency / 3600;

    arraysUsed.push({
      moduleId,
      generatedEnergyKwh,
    });
    totalGeneratedEnergyKwh += generatedEnergyKwh;
  }

  let remainingGeneratedEnergyKwh = totalGeneratedEnergyKwh;

  for (const batteryId of batteryIds) {
    if (remainingGeneratedEnergyKwh <= 0) {
      break;
    }

    const batteryRecord = modules[batteryId];
    if (!isBatteryChargeable(batteryRecord)) {
      continue;
    }

    const currentEnergyKwh = getBatteryStoredEnergyKw(batteryRecord);
    const storageCapacityKwh = getBatteryStorageCapacityKwh(batteryRecord);
    const availableCapacityKwh = Math.max(0, storageCapacityKwh - currentEnergyKwh);
    const chargedEnergyKwh = Math.min(availableCapacityKwh, remainingGeneratedEnergyKwh);

    setBatteryStoredEnergyKw(batteryRecord, currentEnergyKwh + chargedEnergyKwh);
    remainingGeneratedEnergyKwh -= chargedEnergyKwh;
  }

  return {
    irradianceWPerM2,
    totalGeneratedEnergyKwh,
    discardedEnergyKwh: remainingGeneratedEnergyKwh,
    arraysUsed,
  };
}

function runSinglePowerTick(modules: ModuleIndex): {
  modules: ModuleIndex;
  summary: PowerTickSummary;
} {
  return runSinglePowerTickWithSolar(modules, 0);
}

function runSinglePowerTickWithSolar(
  modules: ModuleIndex,
  irradianceWPerM2: number,
): {
  modules: ModuleIndex;
  summary: PowerTickSummary;
} {
  const nextModules = sanitizeModules(cloneModules(modules));
  const batteryIds = getBatteryIds(nextModules);
  const solar = applySolarGeneration(nextModules, batteryIds, irradianceWPerM2);
  const totalAvailableEnergyKwh = batteryIds.reduce((total, batteryId) => {
    return total + getBatteryStoredEnergyKw(nextModules[batteryId]);
  }, 0);
  const totalPowerDrawKw = Object.values(nextModules).reduce((total, moduleRecord) => {
    return total + getModulePowerDrawKw(moduleRecord);
  }, 0);
  const totalEnergyDemandKwh = convertPowerKwToTickEnergyKwh(totalPowerDrawKw);
  let remainingAllocatableEnergyKwh = totalAvailableEnergyKwh;
  let totalEnergyAllocatedKwh = 0;
  const forcedOfflineModuleIds: string[] = [];

  for (const demandEntry of getModuleDemandEntries(nextModules)) {
    if (demandEntry.isForcedOfflineCandidate && remainingAllocatableEnergyKwh < demandEntry.energyDemandKwh) {
      nextModules[demandEntry.moduleId].runtimeAttributes.status = "offline";
      forcedOfflineModuleIds.push(demandEntry.moduleId);
      continue;
    }

    const allocatedEnergyKwh = Math.min(remainingAllocatableEnergyKwh, demandEntry.energyDemandKwh);
    remainingAllocatableEnergyKwh -= allocatedEnergyKwh;
    totalEnergyAllocatedKwh += allocatedEnergyKwh;
  }

  const batterySummaries = applyBatteryDrain(nextModules, batteryIds, totalEnergyAllocatedKwh);

  return {
    modules: nextModules,
    summary: {
      totalPowerDrawKw,
      totalEnergyDemandKwh,
      totalEnergyDrainedKwh: totalEnergyAllocatedKwh,
      energyShortfallKwh: totalEnergyDemandKwh - totalEnergyAllocatedKwh,
      batteriesUsed: batterySummaries,
      forcedOfflineModuleIds,
      solar,
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
  irradianceWPerM2 = 0,
): {
  modules: ModuleIndex;
  summary: PowerTickRunSummary;
} {
  if (!Number.isInteger(tickCount) || tickCount <= 0) {
    throw new Error(`Tick count must be a positive integer. Received "${tickCount}".`);
  }

  let nextModules = modules;
  let totalPowerDrawKw = 0;
  let totalEnergyDemandKwh = 0;
  let totalEnergyDrainedKwh = 0;
  let energyShortfallKwh = 0;
  const batterySummaryById = new Map<string, PowerTickBatterySummary>();
  const forcedOfflineModuleIds = new Set<string>();
  const solarArraySummaryById = new Map<string, SolarTickArraySummary>();
  let totalGeneratedEnergyKwh = 0;
  let discardedEnergyKwh = 0;

  for (let index = 0; index < tickCount; index += 1) {
    const result = runSinglePowerTickWithSolar(nextModules, irradianceWPerM2);
    nextModules = result.modules;
    totalPowerDrawKw += result.summary.totalPowerDrawKw;
    totalEnergyDemandKwh += result.summary.totalEnergyDemandKwh;
    totalEnergyDrainedKwh += result.summary.totalEnergyDrainedKwh;
    energyShortfallKwh += result.summary.energyShortfallKwh;
    totalGeneratedEnergyKwh += result.summary.solar.totalGeneratedEnergyKwh;
    discardedEnergyKwh += result.summary.solar.discardedEnergyKwh;
    for (const moduleId of result.summary.forcedOfflineModuleIds) {
      forcedOfflineModuleIds.add(moduleId);
    }

    for (const batterySummary of result.summary.batteriesUsed) {
      batterySummaryById.set(batterySummary.moduleId, {
        moduleId: batterySummary.moduleId,
        drainedEnergyKwh:
          (batterySummaryById.get(batterySummary.moduleId)?.drainedEnergyKwh ?? 0) +
          batterySummary.drainedEnergyKwh,
        remainingEnergyKwh: batterySummary.remainingEnergyKwh,
      });
    }

    for (const arraySummary of result.summary.solar.arraysUsed) {
      solarArraySummaryById.set(arraySummary.moduleId, {
        moduleId: arraySummary.moduleId,
        generatedEnergyKwh:
          (solarArraySummaryById.get(arraySummary.moduleId)?.generatedEnergyKwh ?? 0) +
          arraySummary.generatedEnergyKwh,
      });
    }
  }

  return {
    modules: nextModules,
    summary: {
      tickCount,
      averagePowerDrawKw: totalPowerDrawKw / tickCount,
      totalEnergyDemandKwh,
      totalEnergyDrainedKwh,
      energyShortfallKwh,
      batteriesUsed: [...batterySummaryById.values()].sort((left, right) =>
        left.moduleId.localeCompare(right.moduleId),
      ),
      forcedOfflineModuleIds: [...forcedOfflineModuleIds].sort((left, right) =>
        left.localeCompare(right),
      ),
      solar: {
        irradianceWPerM2,
        totalGeneratedEnergyKwh,
        discardedEnergyKwh,
        arraysUsed: [...solarArraySummaryById.values()].sort((left, right) =>
          left.moduleId.localeCompare(right.moduleId),
        ),
      },
    },
  };
}

export function advanceBuildQueue(
  modules: ModuleIndex,
  builds: BuildIndex,
  blueprints: BlueprintIndex,
  tickCount: number,
): {
  modules: ModuleIndex;
  builds: BuildIndex;
  summary: BuildTickSummary;
} {
  if (!Number.isInteger(tickCount) || tickCount <= 0) {
    throw new Error(`Tick count must be a positive integer. Received "${tickCount}".`);
  }

  const nextModules = cloneModules(modules);
  const nextBuilds = cloneBuilds(builds);
  const completedBuilds: BuildCompletionSummary[] = [];

  for (const buildId of Object.keys(nextBuilds).sort((left, right) => left.localeCompare(right))) {
    const buildRecord = nextBuilds[buildId];
    buildRecord.remainingTicks = Math.max(0, buildRecord.remainingTicks - tickCount);

    if (buildRecord.remainingTicks > 0) {
      continue;
    }

    const completedModule = createLocalModule(
      nextModules,
      blueprints,
      buildRecord.blueprintId,
      buildRecord.displayName,
    );

    if (typeof buildRecord.assignedFacilityModuleId === "string") {
      const assignedModule = nextModules[buildRecord.assignedFacilityModuleId];

      if (assignedModule) {
        deleteModuleCurrentJobId(assignedModule);
      }
    }

    nextModules[completedModule.id] = completedModule;
    completedBuilds.push({
      buildId,
      moduleId: completedModule.id,
      displayName: completedModule.displayName,
    });
    delete nextBuilds[buildId];
  }

  synchronizeWorkshopAssignments(nextModules, nextBuilds);

  return {
    modules: nextModules,
    builds: nextBuilds,
    summary: {
      tickCount,
      advancedBuilds: Object.keys(builds).length,
      completedBuilds,
      canceledBuilds: [],
    },
  };
}

export function getHabitatDatabasePath(): string {
  return databaseFilePath;
}
