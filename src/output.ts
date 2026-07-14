import {
  getModulePowerDrawKw,
  type HabitatRecord,
  type IndustryResource,
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
  quantityRange: { min: number; max: number } | null;
};

type ScanTileSummary = {
  x: number | null;
  y: number | null;
  distance: number | null;
  terrain: string;
  quantityEstimate: number | null;
  quantityRange: { min: number; max: number } | null;
  probabilities: ScanProbabilityRow[];
};

type ScanOutputOptions = {
  x: number;
  y: number;
  sensorStrength: number;
  radiusTiles: number;
  officialResources: IndustryResource[];
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

  const estimatedKg = readNumber(value.estimatedKg);

  if (estimatedKg !== null) {
    return estimatedKg;
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

function readQuantityRange(value: unknown): { min: number; max: number } | null {
  if (!isRecord(value)) {
    return null;
  }

  const minimum =
    readNumber(value.minimumKg) ??
    readNumber(value.quantityEstimateMin) ??
    readNumber(value.minimumQuantityEstimate) ??
    readNumber(value.minimumQuantity) ??
    readNumber(value.minQuantityEstimate) ??
    readNumber(value.minQuantity);
  const maximum =
    readNumber(value.maximumKg) ??
    readNumber(value.quantityEstimateMax) ??
    readNumber(value.maximumQuantityEstimate) ??
    readNumber(value.maximumQuantity) ??
    readNumber(value.maxQuantityEstimate) ??
    readNumber(value.maxQuantity);

  if (minimum === null || maximum === null) {
    return null;
  }

  return { min: minimum, max: maximum };
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
          "none",
        probability:
          (readNumber(entry.probabilityPct) ?? readNumber(entry.probability) ?? 0) /
          (readNumber(entry.probabilityPct) !== null ? 100 : 1),
        quantityEstimate: readQuantityEstimate(entry),
        quantityRange: readQuantityRange(entry),
      };
    });
}

function extractScanTiles(response: WorldScanResponse): ScanTileSummary[] {
  const scanEnvelope = isRecord(response.scan) ? response.scan : null;
  const rawTiles = Array.isArray(scanEnvelope?.tiles)
    ? scanEnvelope.tiles
    : Array.isArray(response.tiles)
      ? response.tiles
      : Array.isArray(response.results)
        ? response.results
        : [];

  return rawTiles.filter(isRecord).map((tile) => {
    const { x, y } = readCoordinates(tile);
    const probabilities = extractProbabilities(tile);
    const sortedProbabilities = sortByProbability(probabilities);
    const tileQuantityEstimate = readQuantityEstimate(tile);
    const tileQuantityRange = readQuantityRange(tile);
    const topCandidate = isRecord(tile.topCandidate)
      ? {
          resourceType: readString(tile.topCandidate.resourceType) ?? "none",
          probability:
            (readNumber(tile.topCandidate.probabilityPct) ??
              readNumber(tile.topCandidate.probability) ??
              0) /
            (readNumber(tile.topCandidate.probabilityPct) !== null ? 100 : 1),
          quantityEstimate: readQuantityEstimate(tile.quantityEstimate),
          quantityRange: readQuantityRange(tile.quantityEstimate),
        }
      : null;
    const topProbabilityQuantityEstimate =
      topCandidate?.quantityEstimate ?? sortedProbabilities[0]?.quantityEstimate ?? null;
    const topProbabilityQuantityRange =
      topCandidate?.quantityRange ?? sortedProbabilities[0]?.quantityRange ?? null;
    const normalizedProbabilities = topCandidate
      ? [
          topCandidate,
          ...sortedProbabilities.filter(
            (probability) => probability.resourceType !== topCandidate.resourceType,
          ),
        ]
      : probabilities;

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
      quantityRange: tileQuantityRange ?? topProbabilityQuantityRange,
      probabilities: normalizedProbabilities,
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
  return `${(value * 100).toFixed(2)}%`;
}

function formatQuantityEstimate(value: number | null): string {
  return value === null ? "unknown" : String(value);
}

function formatQuantityRange(value: { min: number; max: number } | null): string {
  return value === null ? "unknown" : `${value.min} to ${value.max}`;
}

function normalizeTerrainName(terrain: string): string {
  const normalized = terrain.trim().toLowerCase();

  if (normalized.includes("plain") || normalized.includes("flat")) {
    return "flat";
  }

  return terrain;
}

function getOfficialMaterialTypes(resources: IndustryResource[]): string[] {
  const materialTypes = resources
    .filter((resource) => resource.kind.trim().toLowerCase() === "material")
    .map((resource) => resource.resourceType);

  if (materialTypes.length > 0) {
    return [...new Set(materialTypes)];
  }

  return [...new Set(resources.map((resource) => resource.resourceType))];
}

function buildProbabilityLookup(
  probabilities: ScanProbabilityRow[],
): Map<string, ScanProbabilityRow> {
  const lookup = new Map<string, ScanProbabilityRow>();

  for (const probability of probabilities) {
    lookup.set(probability.resourceType, probability);
  }

  return lookup;
}

function createNormalizedProbabilityRows(
  probabilities: ScanProbabilityRow[],
  officialResources: IndustryResource[],
): ScanProbabilityRow[] {
  const officialMaterialTypes = getOfficialMaterialTypes(officialResources);
  const probabilityLookup = buildProbabilityLookup(probabilities);
  const normalizedRows: ScanProbabilityRow[] = [];
  let explicitTotal = 0;

  for (const resourceType of officialMaterialTypes) {
    const probability = probabilityLookup.get(resourceType);
    const nextRow: ScanProbabilityRow = {
      resourceType,
      probability: probability?.probability ?? 0,
      quantityEstimate: probability?.quantityEstimate ?? null,
      quantityRange: probability?.quantityRange ?? null,
    };

    explicitTotal += nextRow.probability;
    normalizedRows.push(nextRow);
  }

  const noneProbability =
    probabilityLookup.get("none")?.probability ??
    probabilityLookup.get("empty")?.probability ??
    Math.max(0, 1 - explicitTotal);

  normalizedRows.push({
    resourceType: "none",
    probability: noneProbability,
    quantityEstimate: null,
    quantityRange: null,
  });

  const total = normalizedRows.reduce((sum, row) => sum + row.probability, 0);

  if (total <= 0) {
    return normalizedRows.map((row) => ({
      ...row,
      probability: row.resourceType === "none" ? 1 : 0,
    }));
  }

  return normalizedRows.map((row) => ({
    ...row,
    probability: row.probability / total,
  }));
}

function getRoundedPercents(probabilities: number[]): number[] {
  const scaledEntries = probabilities.map((probability, index) => {
    const scaled = probability * 10000;
    const floorValue = Math.floor(scaled);

    return {
      index,
      floorValue,
      remainder: scaled - floorValue,
    };
  });
  let assignedTotal = scaledEntries.reduce((sum, entry) => sum + entry.floorValue, 0);
  const missingUnits = 10000 - assignedTotal;

  for (const entry of scaledEntries
    .slice()
    .sort((left, right) => right.remainder - left.remainder)
    .slice(0, Math.max(0, missingUnits))) {
    scaledEntries[entry.index].floorValue += 1;
    assignedTotal += 1;
  }

  return scaledEntries.map((entry) => entry.floorValue);
}

function formatRoundedPercent(value: number): string {
  return `${(value / 100).toFixed(2)}%`;
}

function sortByProbability(probabilities: ScanProbabilityRow[]): ScanProbabilityRow[] {
  return [...probabilities].sort((left, right) => right.probability - left.probability);
}

function getTopCandidate(tile: ScanTileSummary, probabilities: ScanProbabilityRow[]): ScanProbabilityRow {
  const sorted = sortByProbability(probabilities);

  return {
    resourceType: sorted[0]?.resourceType ?? "none",
    probability: sorted[0]?.probability ?? 0,
    quantityEstimate:
      sorted[0]?.quantityEstimate ??
      tile.quantityEstimate,
    quantityRange:
      sorted[0]?.quantityRange ??
      tile.quantityRange,
  };
}

export function printScanResponse(
  response: WorldScanResponse,
  options: ScanOutputOptions,
): void {
  const tiles = extractScanTiles(response);

  if (tiles.length === 0) {
    console.log("No scan tiles were returned.");
    return;
  }

  console.log(
    `Scan position: (${options.x}, ${options.y}) | Sensor strength: ${options.sensorStrength} | Radius: ${options.radiusTiles}`,
  );

  if (tiles.length === 1) {
    const tile = tiles[0];
    const probabilities = createNormalizedProbabilityRows(tile.probabilities, options.officialResources);
    const roundedPercents = getRoundedPercents(probabilities.map((entry) => entry.probability));
    const topCandidate = getTopCandidate(tile, probabilities);

    console.log(`Terrain: ${normalizeTerrainName(tile.terrain)}`);
    console.log(
      `Most likely resource: ${topCandidate.resourceType} (${formatProbability(topCandidate.probability)})`,
    );

    if (topCandidate.resourceType !== "none") {
      console.log(`Estimated quantity: ${formatQuantityEstimate(topCandidate.quantityEstimate)}`);
      console.log(`Estimated range: ${formatQuantityRange(topCandidate.quantityRange)}`);
    }

    if (probabilities.length === 0) {
      console.log("No resource probabilities were returned for this tile.");
      return;
    }

    console.table(
      probabilities.map((entry, index) => ({
        Resource: entry.resourceType,
        Probability: formatRoundedPercent(roundedPercents[index]),
      })),
    );
    return;
  }

  console.table(
    tiles.map((tile) => {
      const probabilities = createNormalizedProbabilityRows(tile.probabilities, options.officialResources);
      const topCandidate = getTopCandidate(tile, probabilities);

      return {
        Coordinates: `(${formatCoordinate(tile.x)}, ${formatCoordinate(tile.y)})`,
        Distance: formatDistance(tile.distance),
        Terrain: normalizeTerrainName(tile.terrain),
        "Top Candidate": topCandidate.resourceType,
        Confidence: formatProbability(topCandidate.probability),
        "Estimated Quantity": formatQuantityEstimate(topCandidate.quantityEstimate),
      };
    }),
  );
}
