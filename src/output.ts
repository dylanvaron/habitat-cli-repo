import {
  getModulePowerDrawKw,
  type HabitatRecord,
  type LocalBuild,
  type LocalModule,
  type LocalRegistration,
  type WorldScanResponse,
} from "./state";

export function printLocalRegistration(registration: LocalRegistration): void {
  console.log("Local registration");
  console.log(`Habitat name: ${registration.displayName}`);
  console.log(`Habitat UUID: ${registration.habitatUuid}`);
  console.log(`Habitat ID: ${registration.habitatId}`);
  console.log(`Base URL: ${registration.baseUrl}`);
  console.log(`Registered at: ${registration.registeredAt}`);
}

export function printRemoteHabitat(habitat: HabitatRecord): void {
  console.log("Remote registration");
  console.log(`Habitat ID: ${habitat.id}`);
  console.log(`Slug: ${habitat.habitatSlug}`);
  console.log(`Display name: ${habitat.displayName}`);
  console.log(`Catalog version: ${habitat.catalogVersion}`);
  console.log(`Status: ${habitat.status}`);
  console.log(`Last seen at: ${habitat.lastSeenAt ?? "never"}`);
}

export function printModule(moduleRecord: LocalModule): void {
  console.log(JSON.stringify(moduleRecord, null, 2));
}

export function printBuild(buildRecord: LocalBuild): void {
  console.log(JSON.stringify(buildRecord, null, 2));
}

export function printModuleStatusTable(modules: LocalModule[]): void {
  const rows = modules.map((moduleRecord) => {
    const status =
      typeof moduleRecord.runtimeAttributes.status === "string"
        ? moduleRecord.runtimeAttributes.status
        : "unknown";

    return {
      "Module Name": moduleRecord.displayName,
      State: status,
      "Power Draw (kW)": getModulePowerDrawKw(moduleRecord),
    };
  });

  console.table(rows);

  const totalCurrentPowerDrawKw = rows.reduce((total, row) => {
    return total + Number(row["Power Draw (kW)"] || 0);
  }, 0);
  const oneTickEnergyCostKwh = totalCurrentPowerDrawKw / 3600;

  console.log(
    `Total current power draw: ${totalCurrentPowerDrawKw} kW | Energy cost for one tick: ${oneTickEnergyCostKwh.toFixed(6)} kWh`,
  );
}

type ScanProbabilityRow = {
  resourceType: string;
  probability: number;
  quantityEstimate: number | null;
};

type ScanTileSummary = {
  x: number | null;
  y: number | null;
  distance: number | null;
  terrain: string;
  quantityEstimate: number | null;
  probabilities: ScanProbabilityRow[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readQuantityEstimate(value: unknown): number | null {
  if (!isRecord(value)) {
    return null;
  }

  const directQuantityEstimate = readNumber(value.quantityEstimate);

  if (directQuantityEstimate !== null) {
    return directQuantityEstimate;
  }

  const estimatedQuantity = readNumber(value.estimatedQuantity);

  if (estimatedQuantity !== null) {
    return estimatedQuantity;
  }

  return null;
}

function readCoordinates(tile: Record<string, unknown>): { x: number | null; y: number | null } {
  const x = readNumber(tile.x);
  const y = readNumber(tile.y);

  if (x !== null || y !== null) {
    return { x, y };
  }

  const coordinates = tile.coordinates;

  if (!isRecord(coordinates)) {
    return { x: null, y: null };
  }

  return {
    x: readNumber(coordinates.x),
    y: readNumber(coordinates.y),
  };
}

function extractProbabilities(tile: Record<string, unknown>): ScanProbabilityRow[] {
  const rawProbabilities = Array.isArray(tile.probabilities)
    ? tile.probabilities
    : Array.isArray(tile.resourceProbabilities)
      ? tile.resourceProbabilities
      : [];

  return rawProbabilities
    .filter(isRecord)
    .map((entry) => {
      return {
        resourceType:
          readString(entry.resourceType) ??
          readString(entry.siteType) ??
          readString(entry.resource) ??
          "unknown",
        probability: readNumber(entry.probability) ?? 0,
        quantityEstimate: readQuantityEstimate(entry),
      };
    })
    .sort((left, right) => right.probability - left.probability);
}

function extractScanTiles(response: WorldScanResponse): ScanTileSummary[] {
  const rawTiles = Array.isArray(response.tiles)
    ? response.tiles
    : Array.isArray(response.results)
      ? response.results
      : [];

  return rawTiles.filter(isRecord).map((tile) => {
    const { x, y } = readCoordinates(tile);
    const probabilities = extractProbabilities(tile);
    const tileQuantityEstimate = readQuantityEstimate(tile);
    const topProbabilityQuantityEstimate = probabilities[0]?.quantityEstimate ?? null;

    return {
      x,
      y,
      distance:
        readNumber(tile.distance) ??
        readNumber(tile.distanceTiles) ??
        readNumber(tile.euclideanDistance),
      terrain:
        readString(tile.terrain) ??
        readString(tile.terrainType) ??
        readString(tile.surface) ??
        "unknown",
      quantityEstimate:
        tileQuantityEstimate !== null ? tileQuantityEstimate : topProbabilityQuantityEstimate,
      probabilities,
    };
  });
}

function formatCoordinate(value: number | null): string {
  return value === null ? "?" : String(value);
}

function formatDistance(value: number | null): string {
  return value === null ? "?" : value.toFixed(2);
}

function formatProbability(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatQuantityEstimate(value: number | null): string {
  return value === null ? "unknown" : String(value);
}

export function printScanResponse(response: WorldScanResponse): void {
  const tiles = extractScanTiles(response);

  if (tiles.length === 0) {
    console.log("No scan tiles were returned.");
    return;
  }

  if (tiles.length === 1) {
    const tile = tiles[0];

    console.log(
      `Tile (${formatCoordinate(tile.x)}, ${formatCoordinate(tile.y)}) | Distance: ${formatDistance(tile.distance)} | Terrain: ${tile.terrain}`,
    );
    console.log(`Quantity estimate: ${formatQuantityEstimate(tile.quantityEstimate)}`);

    if (tile.probabilities.length === 0) {
      console.log("No resource probabilities were returned for this tile.");
      return;
    }

    console.table(
      tile.probabilities.map((entry) => ({
        Resource: entry.resourceType,
        Probability: formatProbability(entry.probability),
        "Quantity Estimate": formatQuantityEstimate(entry.quantityEstimate),
      })),
    );
    return;
  }

  console.table(
    tiles.map((tile) => {
      const topCandidate = tile.probabilities[0];

      return {
        Coordinates: `(${formatCoordinate(tile.x)}, ${formatCoordinate(tile.y)})`,
        Distance: formatDistance(tile.distance),
        Terrain: tile.terrain,
        "Top Candidate": topCandidate?.resourceType ?? "unknown",
        Confidence: topCandidate ? formatProbability(topCandidate.probability) : "unknown",
        "Estimated Quantity": formatQuantityEstimate(tile.quantityEstimate),
      };
    }),
  );
}
