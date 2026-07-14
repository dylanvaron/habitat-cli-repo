import { afterEach, describe, expect, mock, test } from "bun:test";
import { printScanResponse } from "./output";

const originalLog = console.log;
const originalTable = console.table;

const officialResources = [
  {
    id: "res_1",
    resourceType: "water-ice",
    displayName: "Water Ice",
    kind: "material",
    rarity: "common",
  },
  {
    id: "res_2",
    resourceType: "iron-ore",
    displayName: "Iron Ore",
    kind: "material",
    rarity: "common",
  },
  {
    id: "res_3",
    resourceType: "silica",
    displayName: "Silica",
    kind: "material",
    rarity: "common",
  },
] as const;

afterEach(() => {
  console.log = originalLog;
  console.table = originalTable;
});

describe("scan output formatting", () => {
  test("prints a normalized full probability table for one tile", () => {
    const logMock = mock(() => {});
    const tableMock = mock(() => {});
    console.log = logMock as typeof console.log;
    console.table = tableMock as typeof console.table;

    printScanResponse(
      {
        scan: {
          modelVersion: "resource-probability-v2",
          origin: { x: 3, y: -2 },
          sensorStrength: 60,
          radiusTiles: 0,
          tiles: [
            {
              x: 3,
              y: -2,
              distanceTiles: 0,
              terrain: "flat",
              topCandidate: {
                resourceType: "water-ice",
                probabilityPct: 72,
              },
              quantityEstimate: {
                resourceType: "water-ice",
                unit: "kg",
                estimatedKg: 18,
                minimumKg: 12,
                maximumKg: 24,
                exact: false,
              },
              probabilities: [
                {
                  resourceType: "water-ice",
                  probabilityPct: 72,
                },
                { resourceType: "iron-ore", probabilityPct: 21 },
              ],
            },
          ],
        },
      },
      {
        x: 3,
        y: -2,
        sensorStrength: 60,
        radiusTiles: 0,
        officialResources: [...officialResources],
      },
    );

    expect(logMock).toHaveBeenCalledWith(
      "Scan position: (3, -2) | Sensor strength: 60 | Radius: 0",
    );
    expect(logMock).toHaveBeenCalledWith("Terrain: flat");
    expect(logMock).toHaveBeenCalledWith("Most likely resource: water-ice (72.00%)");
    expect(logMock).toHaveBeenCalledWith("Estimated quantity: 18");
    expect(logMock).toHaveBeenCalledWith("Estimated range: 12 to 24");
    expect(tableMock).toHaveBeenCalledWith([
      {
        Resource: "water-ice",
        Probability: "72.00%",
      },
      {
        Resource: "iron-ore",
        Probability: "21.00%",
      },
      {
        Resource: "silica",
        Probability: "0.00%",
      },
      {
        Resource: "none",
        Probability: "7.00%",
      },
    ]);
  });

  test("prints one normalized summary row per tile for larger scans", () => {
    const logMock = mock(() => {});
    const tableMock = mock(() => {});
    console.log = logMock as typeof console.log;
    console.table = tableMock as typeof console.table;

    printScanResponse(
      {
        scan: {
          modelVersion: "resource-probability-v2",
          origin: { x: 3, y: -2 },
          sensorStrength: 60,
          radiusTiles: 2,
          tiles: [
            {
              x: 3,
              y: -2,
              distanceTiles: 0,
              terrain: "flat",
              topCandidate: {
                resourceType: "water-ice",
                probabilityPct: 72,
              },
              quantityEstimate: {
                resourceType: "water-ice",
                unit: "kg",
                estimatedKg: 18,
                minimumKg: 12,
                maximumKg: 24,
                exact: false,
              },
              probabilities: [
                { resourceType: "water-ice", probabilityPct: 72 },
                { resourceType: "iron-ore", probabilityPct: 21 },
              ],
            },
            {
              x: 4,
              y: -2,
              distanceTiles: 1,
              terrain: "flat",
              topCandidate: {
                resourceType: "iron-ore",
                probabilityPct: 54,
              },
              quantityEstimate: {
                resourceType: "iron-ore",
                unit: "kg",
                estimatedKg: 9,
                minimumKg: 6,
                maximumKg: 12,
                exact: false,
              },
              probabilities: [
                { resourceType: "iron-ore", probabilityPct: 54 },
                { resourceType: "silica", probabilityPct: 38 },
              ],
            },
          ],
        },
      },
      {
        x: 3,
        y: -2,
        sensorStrength: 60,
        radiusTiles: 2,
        officialResources: [...officialResources],
      },
    );

    expect(logMock).toHaveBeenCalledWith(
      "Scan position: (3, -2) | Sensor strength: 60 | Radius: 2",
    );
    expect(tableMock).toHaveBeenCalledWith([
      {
        Coordinates: "(3, -2)",
        Distance: "0.00",
        Terrain: "flat",
        "Top Candidate": "water-ice",
        Confidence: "72.00%",
        "Estimated Quantity": "18",
      },
      {
        Coordinates: "(4, -2)",
        Distance: "1.00",
        Terrain: "flat",
        "Top Candidate": "iron-ore",
        Confidence: "54.00%",
        "Estimated Quantity": "9",
      },
    ]);
  });
});
