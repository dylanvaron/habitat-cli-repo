export type ApiError = {
  message: string;
  status: number;
};

export type RegistrationRecord = {
  habitatId: string;
  habitatUuid: string;
  displayName: string;
  baseUrl: string;
  registeredAt: string;
};

export type HabitatRecord = {
  id: string;
  habitatSlug: string;
  displayName: string;
  catalogVersion: string;
  status: string;
  lastSeenAt?: string | null;
};

export type RegistrationStatusResponse = {
  registration: RegistrationRecord | null;
  localModulesCount: number;
  queuedBuildsCount: number;
  remoteHabitat?: HabitatRecord;
};

export type RegistrationCreateResponse = {
  registration: RegistrationRecord;
  hydratedModulesCount: number;
};

export type SolarStatusResponse = {
  solarIrradiance: {
    wPerM2: number;
    condition: string;
  };
};

export type ModuleRecord = {
  id: string;
  blueprintId: string;
  moduleType: string | null;
  moduleLevel: number | null;
  displayName: string;
  connectedTo: string[];
  runtimeAttributes: Record<string, unknown>;
  capabilities: string[];
};

export type ModulesResponse = {
  modules: ModuleRecord[];
};

export type ModuleResponse = {
  module: ModuleRecord;
  powerDrawKw?: number;
};

export type TickResponse = {
  powerSummary: {
    tickCount: number;
    averagePowerDrawKw: number;
    totalEnergyDemandKwh: number;
    totalEnergyDrainedKwh: number;
    energyShortfallKwh: number;
    batteriesUsed: Array<{
      moduleId: string;
      drainedEnergyKwh: number;
      remainingEnergyKwh: number;
    }>;
    forcedOfflineModuleIds: string[];
    solar: {
      irradianceWPerM2: number;
      totalGeneratedEnergyKwh: number;
      discardedEnergyKwh: number;
      arraysUsed: Array<{
        moduleId: string;
        generatedEnergyKwh: number;
      }>;
    };
  };
  buildSummary: {
    tickCount: number;
    advancedBuilds: number;
    completedBuilds: Array<{
      buildId: string;
      moduleId: string;
      displayName: string;
    }>;
    canceledBuilds: Array<{
      buildId: string;
      displayName: string;
      reason: string;
    }>;
  };
  canceledBuilds: Array<{
    buildId: string;
    displayName: string;
    reason: string;
  }>;
};

async function readError(response: Response): Promise<ApiError> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const payload = (await response.json()) as { error?: string; message?: string };
    return {
      message: payload.error ?? payload.message ?? `${response.status} ${response.statusText}`,
      status: response.status,
    };
  }

  const text = await response.text();
  return {
    message: text || `${response.status} ${response.statusText}`,
    status: response.status,
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw await readError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function getHealth(): Promise<{ ok: true; service: string }> {
  return request("/health");
}

export function getRegistration(): Promise<RegistrationStatusResponse> {
  return request("/registration");
}

export function createRegistration(displayName: string): Promise<RegistrationCreateResponse> {
  return request("/registration", {
    method: "POST",
    body: JSON.stringify({ displayName }),
  });
}

export function deleteRegistration(): Promise<{ displayName: string }> {
  return request("/registration", {
    method: "DELETE",
  });
}

export function getModules(): Promise<ModulesResponse> {
  return request("/modules");
}

export function updateModuleStatus(
  moduleId: string,
  status: "offline" | "online" | "active",
): Promise<ModuleResponse> {
  return request(`/modules/${moduleId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function getSolar(): Promise<SolarStatusResponse> {
  return request("/solar");
}

export function runTick(tickCount: number): Promise<TickResponse> {
  return request("/ticks", {
    method: "POST",
    body: JSON.stringify({ tickCount }),
  });
}
