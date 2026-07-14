import { afterEach, describe, expect, mock, test } from "bun:test";
import { printScanResponse } from "./output";

const originalLog = console.log;
const originalTable = console.table;

afterEach(() => {
  console.log = originalLog;
  console.table = originalTable;
});

describe("scan output formatting", () => {
  test("prints the full probability table and quantity estimate for one tile", () => {
    const logMock = mock(() => {});
    const tableMock = mock(() => {});
    console.log = logMock as typeof console.log;
    console.table = tableMock as typeof console.table;

    printScanResponse({
      results: [
        {
          x: 3,
          y: -2,
          distance: 0,
          terrain: "basaltic-plain",
          quantityEstimate: 18,
          probabilities: [
            { resourceType: "water-ice", probability: 0.72 },
            { resourceType: "iron-ore", probability: 0.21 },
          ],
        },
      ],
    });

    expect(logMock).toHaveBeenCalledWith(
      "Tile (3, -2) | Distance: 0.00 | Terrain: basaltic-plain",
    );
    expect(logMock).toHaveBeenCalledWith("Quantity estimate: 18");
    expect(tableMock).toHaveBeenCalledWith([
      {
        Resource: "water-ice",
        Probability: "72.0%",
        "Quantity Estimate": "unknown",
      },
      {
        Resource: "iron-ore",
        Probability: "21.0%",
        "Quantity Estimate": "unknown",
      },
    ]);
  });

  test("prints one summary row per tile for larger scans", () => {
    const logMock = mock(() => {});
    const tableMock = mock(() => {});
    console.log = logMock as typeof console.log;
    console.table = tableMock as typeof console.table;

    printScanResponse({
      results: [
        {
          x: 3,
          y: -2,
          distance: 0,
          terrain: "basaltic-plain",
          quantityEstimate: 18,
          probabilities: [
            { resourceType: "water-ice", probability: 0.72 },
            { resourceType: "iron-ore", probability: 0.21 },
          ],
        },
        {
          x: 4,
          y: -2,
          distance: 1,
          terrain: "dust-flat",
          quantityEstimate: null,
          probabilities: [
            { resourceType: "iron-ore", probability: 0.54 },
            { resourceType: "silica", probability: 0.38 },
          ],
        },
      ],
    });

    expect(tableMock).toHaveBeenCalledWith([
      {
        Coordinates: "(3, -2)",
        Distance: "0.00",
        Terrain: "basaltic-plain",
        "Top Candidate": "water-ice",
        Confidence: "72.0%",
        "Estimated Quantity": "18",
      },
      {
        Coordinates: "(4, -2)",
        Distance: "1.00",
        Terrain: "dust-flat",
        "Top Candidate": "iron-ore",
        Confidence: "54.0%",
        "Estimated Quantity": "unknown",
      },
    ]);
    expect(logMock).not.toHaveBeenCalled();
  });
});
