import type {
  BlueprintCatalogResponse,
  BlueprintResponse,
  HabitatResponse,
  ResourceCatalogResponse,
  RegistrationResponse,
  SolarIrradianceResponse,
  WorldScanResponse,
} from "./state";
import { getRequestPathLabel, logEvent } from "./logging";

export function getBaseUrl(): string {
  const rawBaseUrl =
    process.env.KEPLER_BASE_URL ??
    process.env.KEPLER_WORLD_BASE_URL ??
    process.env.PLANET_SERVER_PUBLIC_BASE_URL ??
    "https://planet.turingguild.com";

  return rawBaseUrl.replace(/\/+$/, "");
}

function getToken(): string {
  const token =
    process.env.KEPLER_PLANET_TOKEN ??
    process.env.KEPLER_WORLD_TOKEN ??
    process.env.PLANET_TOKEN;

  if (!token) {
    throw new Error(
      "Missing Kepler bearer token. Set KEPLER_PLANET_TOKEN, KEPLER_WORLD_TOKEN, or PLANET_TOKEN.",
    );
  }

  return token;
}

function buildRequestPath(
  requestPath: string,
  query: Record<string, string | undefined> = {},
): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string" && value.length > 0) {
      params.set(key, value);
    }
  }

  const queryString = params.toString();
  return queryString ? `${requestPath}?${queryString}` : requestPath;
}

export async function keplerRequest<T>(
  method: "GET" | "POST" | "DELETE",
  requestPath: string,
  baseUrlOverride?: string,
  body?: unknown,
): Promise<T> {
  const requestUrl = `${baseUrlOverride ?? getBaseUrl()}${requestPath}`;
  const path = getRequestPathLabel(requestPath);
  logEvent("kepler", `${method} ${path} -> request`);

  const response = await fetch(requestUrl, {
    method,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  logEvent("kepler", `${method} ${path} -> ${response.status}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Kepler request failed (${response.status} ${response.statusText}): ${errorText}`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function registerHabitatRequest(
  displayName: string,
  habitatUuid: string,
): Promise<RegistrationResponse> {
  return keplerRequest<RegistrationResponse>("POST", "/habitats/register", undefined, {
    habitatUuid,
    displayName,
  });
}

export async function getHabitatRegistrationRequest(
  habitatId: string,
  baseUrl: string,
): Promise<HabitatResponse> {
  return keplerRequest<HabitatResponse>(
    "GET",
    `/habitats/${habitatId}/registration`,
    baseUrl,
  );
}

export async function deleteHabitatRequest(habitatId: string, baseUrl: string): Promise<void> {
  return keplerRequest<void>("DELETE", `/habitats/${habitatId}`, baseUrl);
}

export async function listOfficialBlueprints(
  version?: string,
): Promise<BlueprintCatalogResponse> {
  return keplerRequest<BlueprintCatalogResponse>(
    "GET",
    buildRequestPath("/catalog/blueprints", { version }),
  );
}

export async function getOfficialBlueprint(
  blueprintId: string,
  version?: string,
): Promise<BlueprintResponse> {
  return keplerRequest<BlueprintResponse>(
    "GET",
    buildRequestPath(`/catalog/blueprints/${blueprintId}`, { version }),
  );
}

export async function listOfficialResources(
  version?: string,
): Promise<ResourceCatalogResponse> {
  return keplerRequest<ResourceCatalogResponse>(
    "GET",
    buildRequestPath("/catalog/resources", { version }),
  );
}

export async function getWorldSolarIrradiance(): Promise<SolarIrradianceResponse> {
  return keplerRequest<SolarIrradianceResponse>("GET", "/world/solar-irradiance");
}

export async function scanWorldTiles(
  habitatId: string,
  x: number,
  y: number,
  sensorStrength: number,
  radiusTiles: number,
): Promise<WorldScanResponse> {
  return keplerRequest<WorldScanResponse>(
    "GET",
    buildRequestPath("/world/scan", {
      habitatId,
      x: String(x),
      y: String(y),
      sensorStrength: String(sensorStrength),
      radiusTiles: String(radiusTiles),
    }),
  );
}
