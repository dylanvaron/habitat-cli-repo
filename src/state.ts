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

export function getHabitatDirPath(): string {
  return habitatDirPath;
}
