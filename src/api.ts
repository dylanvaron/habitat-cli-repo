export function getHabitatApiBaseUrl(): string {
  const rawBaseUrl = process.env.HABITAT_API_BASE_URL ?? "http://127.0.0.1:3000";
  return rawBaseUrl.replace(/\/+$/, "");
}

import type {
  BlueprintCatalogResponse,
  BlueprintResponse,
  BuildCancellationSummary,
  BuildTickSummary,
  HabitatRecord,
  LocalBuild,
  LocalModule,
  LocalRegistration,
  ModuleRuntimeStatus,
  PowerTickRunSummary,
  ResourceCatalogResponse,
  ResourceInventory,
  SolarIrradianceResponse,
} from "./state";

type ApiMethod = "GET" | "POST" | "PATCH" | "DELETE";

type ApiErrorResponse = {
  error?: string;
  message?: string;
};

async function readApiErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const payload = (await response.json()) as ApiErrorResponse;
    const apiMessage = payload.error ?? payload.message;

    if (typeof apiMessage === "string" && apiMessage.trim().length > 0) {
      return apiMessage;
    }
  } else {
    const responseText = await response.text();

    if (responseText.trim().length > 0) {
      return responseText;
    }
  }

  return `${response.status} ${response.statusText}`;
}

export async function habitatApiRequest<T>(
  method: ApiMethod,
  requestPath: string,
  body?: unknown,
): Promise<T> {
  const requestUrl = `${getHabitatApiBaseUrl()}${requestPath}`;

  const response = await fetch(requestUrl, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const message = await readApiErrorMessage(response);
    throw new Error(`Habitat API request failed: ${message}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export type RegistrationStatusResponse = {
  registration: LocalRegistration | null;
  localModulesCount: number;
  queuedBuildsCount: number;
  remoteHabitat?: HabitatRecord;
};

export type CreateRegistrationResponse = {
  registration: LocalRegistration;
  hydratedModulesCount: number;
};

export type DeleteRegistrationResponse = {
  displayName: string;
};

export async function getRegistrationStatus(): Promise<RegistrationStatusResponse> {
  return habitatApiRequest<RegistrationStatusResponse>("GET", "/registration");
}

export async function createRegistration(displayName: string): Promise<CreateRegistrationResponse> {
  return habitatApiRequest<CreateRegistrationResponse>("POST", "/registration", {
    displayName,
  });
}

export async function deleteRegistration(): Promise<DeleteRegistrationResponse> {
  return habitatApiRequest<DeleteRegistrationResponse>("DELETE", "/registration");
}

export async function listCatalogBlueprints(version?: string): Promise<BlueprintCatalogResponse> {
  const params = new URLSearchParams();

  if (version) {
    params.set("version", version);
  }

  const query = params.toString();
  return habitatApiRequest<BlueprintCatalogResponse>(
    "GET",
    query ? `/catalog/blueprints?${query}` : "/catalog/blueprints",
  );
}

export async function getCatalogBlueprint(
  blueprintId: string,
  version?: string,
): Promise<BlueprintResponse> {
  const params = new URLSearchParams();

  if (version) {
    params.set("version", version);
  }

  const query = params.toString();
  return habitatApiRequest<BlueprintResponse>(
    "GET",
    query ? `/catalog/blueprints/${blueprintId}?${query}` : `/catalog/blueprints/${blueprintId}`,
  );
}

export async function listCatalogResources(version?: string): Promise<ResourceCatalogResponse> {
  const params = new URLSearchParams();

  if (version) {
    params.set("version", version);
  }

  const query = params.toString();
  return habitatApiRequest<ResourceCatalogResponse>(
    "GET",
    query ? `/catalog/resources?${query}` : "/catalog/resources",
  );
}

export async function getSolarStatus(): Promise<SolarIrradianceResponse> {
  return habitatApiRequest<SolarIrradianceResponse>("GET", "/solar");
}

export type ModulesResponse = {
  modules: LocalModule[];
};

export type ModuleResponse = {
  module: LocalModule;
};

export type InventoryResponse = {
  inventory: ResourceInventory;
};

export type InventoryUpdateResponse = {
  inventory: ResourceInventory;
  resourceType: string;
  amount: number;
};

export type BuildsResponse = {
  builds: LocalBuild[];
};

export type BuildResponse = {
  build: LocalBuild;
};

export type CreateBuildResponse = {
  build: LocalBuild;
  assignedFacilityModuleId: string | null;
  inventory: ResourceInventory;
  dryRun: boolean;
};

export type CancelBuildResponse = {
  canceledBuild: LocalBuild;
  reason: string;
};

export type TickResponse = {
  powerSummary: PowerTickRunSummary;
  buildSummary: BuildTickSummary;
  canceledBuilds: BuildCancellationSummary[];
};

export async function listModules(): Promise<ModulesResponse> {
  return habitatApiRequest<ModulesResponse>("GET", "/modules");
}

export async function getModule(moduleId: string): Promise<ModuleResponse> {
  return habitatApiRequest<ModuleResponse>("GET", `/modules/${moduleId}`);
}

export async function createModule(
  blueprintId: string,
  displayName: string,
): Promise<ModuleResponse> {
  return habitatApiRequest<ModuleResponse>("POST", "/modules", {
    blueprintId,
    displayName,
  });
}

export async function updateModule(
  moduleId: string,
  updates: {
    displayName?: string;
    status?: string;
    runtimeAttributes?: Record<string, unknown>;
  },
): Promise<ModuleResponse> {
  return habitatApiRequest<ModuleResponse>("PATCH", `/modules/${moduleId}`, updates);
}

export async function setModuleStatus(
  moduleId: string,
  status: ModuleRuntimeStatus,
): Promise<ModuleResponse> {
  return updateModule(moduleId, { status });
}

export async function deleteModule(moduleId: string): Promise<void> {
  return habitatApiRequest<void>("DELETE", `/modules/${moduleId}`);
}

export async function getInventory(): Promise<InventoryResponse> {
  return habitatApiRequest<InventoryResponse>("GET", "/inventory");
}

export async function addInventoryResource(
  resourceType: string,
  amount: number,
): Promise<InventoryUpdateResponse> {
  return habitatApiRequest<InventoryUpdateResponse>("PATCH", "/inventory", {
    resourceType,
    amount,
  });
}

export async function listBuilds(): Promise<BuildsResponse> {
  return habitatApiRequest<BuildsResponse>("GET", "/builds");
}

export async function getBuild(buildId: string): Promise<BuildResponse> {
  return habitatApiRequest<BuildResponse>("GET", `/builds/${buildId}`);
}

export async function createBuild(
  blueprintId: string,
  displayName: string,
  dryRun = false,
): Promise<CreateBuildResponse> {
  return habitatApiRequest<CreateBuildResponse>("POST", "/builds", {
    blueprintId,
    displayName,
    dryRun,
  });
}

export async function cancelBuild(buildId: string): Promise<CancelBuildResponse> {
  return habitatApiRequest<CancelBuildResponse>("DELETE", `/builds/${buildId}`);
}

export async function runTick(tickCount: number): Promise<TickResponse> {
  return habitatApiRequest<TickResponse>("POST", "/ticks", { tickCount });
}
