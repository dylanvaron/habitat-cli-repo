import { afterEach, describe, expect, test } from "bun:test";
import { getHabitatApiPort } from "./server";

const originalHabitatApiPort = process.env.HABITAT_API_PORT;

afterEach(() => {
  if (originalHabitatApiPort === undefined) {
    delete process.env.HABITAT_API_PORT;
  } else {
    process.env.HABITAT_API_PORT = originalHabitatApiPort;
  }
});

describe("server startup", () => {
  test("defaults to 8787", () => {
    delete process.env.HABITAT_API_PORT;

    expect(getHabitatApiPort()).toBe(8787);
  });

  test("uses HABITAT_API_PORT when set", () => {
    process.env.HABITAT_API_PORT = "8787";

    expect(getHabitatApiPort()).toBe(8787);
  });

  test("ignores PORT when HABITAT_API_PORT is unset", () => {
    delete process.env.HABITAT_API_PORT;
    process.env.PORT = "7000";

    expect(getHabitatApiPort()).toBe(8787);
  });

  test("rejects invalid port values", () => {
    process.env.HABITAT_API_PORT = "nope";

    expect(() => getHabitatApiPort()).toThrow('Invalid HABITAT_API_PORT value "nope".');
  });
});
