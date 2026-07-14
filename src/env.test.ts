import { afterEach, describe, expect, test } from "bun:test";
import { parseDotEnv } from "./env";

const originalHabitatApiBaseUrl = process.env.HABITAT_API_BASE_URL;

afterEach(() => {
  if (originalHabitatApiBaseUrl === undefined) {
    delete process.env.HABITAT_API_BASE_URL;
  } else {
    process.env.HABITAT_API_BASE_URL = originalHabitatApiBaseUrl;
  }
});

describe("dotenv parsing", () => {
  test("parses simple key value pairs", () => {
    expect(
      parseDotEnv(`
        HABITAT_API_BASE_URL=http://example:8787
        HABITAT_API_PORT=8787
      `),
    ).toEqual({
      HABITAT_API_BASE_URL: "http://example:8787",
      HABITAT_API_PORT: "8787",
    });
  });

  test("ignores comments and strips matching quotes", () => {
    expect(
      parseDotEnv(`
        # comment
        HABITAT_API_BASE_URL="http://example:8787"
        KEPLER_PLANET_TOKEN='secret-token'
      `),
    ).toEqual({
      HABITAT_API_BASE_URL: "http://example:8787",
      KEPLER_PLANET_TOKEN: "secret-token",
    });
  });

  test("ignores malformed keys", () => {
    expect(
      parseDotEnv(`
        123BAD=value
        ALSO BAD
        GOOD_KEY=good
      `),
    ).toEqual({
      GOOD_KEY: "good",
    });
  });
});
