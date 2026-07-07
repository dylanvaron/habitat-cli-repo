#!/usr/bin/env bun

import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import packageJson from "../package.json";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");
const habitatDirPath = path.join(workspaceRoot, ".habitat");
const registrationFilePath = path.join(habitatDirPath, "registration.json");

type RegistrationResponse = {
  habitatId: string;
  starterModules: unknown[];
  blueprints: unknown[];
};

type HabitatRecord = {
  id: string;
  habitatSlug: string;
  displayName: string;
  catalogVersion: string;
  status: string;
  lastSeenAt?: string | null;
};

type HabitatResponse = {
  habitat: HabitatRecord;
};

type LocalRegistration = {
  habitatId: string;
  habitatUuid: string;
  displayName: string;
  baseUrl: string;
  registeredAt: string;
  starterModules: unknown[];
  blueprints: unknown[];
};

function getBaseUrl(): string {
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

function ensureHabitatDir(): void {
  mkdirSync(habitatDirPath, { recursive: true });
}

function loadRegistration(): LocalRegistration | null {
  if (!existsSync(registrationFilePath)) {
    return null;
  }

  const fileContents = readFileSync(registrationFilePath, "utf8");
  return JSON.parse(fileContents) as LocalRegistration;
}

function saveRegistration(registration: LocalRegistration): void {
  ensureHabitatDir();
  writeFileSync(registrationFilePath, `${JSON.stringify(registration, null, 2)}\n`, "utf8");
}

function deleteRegistrationFile(): void {
  if (existsSync(registrationFilePath)) {
    rmSync(registrationFilePath);
  }
}

async function keplerRequest<T>(
  method: "GET" | "POST" | "DELETE",
  requestPath: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${getBaseUrl()}${requestPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

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

function printLocalRegistration(registration: LocalRegistration): void {
  console.log("Local registration");
  console.log(`Habitat name: ${registration.displayName}`);
  console.log(`Habitat UUID: ${registration.habitatUuid}`);
  console.log(`Habitat ID: ${registration.habitatId}`);
  console.log(`Base URL: ${registration.baseUrl}`);
  console.log(`Registered at: ${registration.registeredAt}`);
  console.log(`Starter modules cached: ${registration.starterModules.length}`);
  console.log(`Blueprints cached: ${registration.blueprints.length}`);
}

function printRemoteHabitat(habitat: HabitatRecord): void {
  console.log("Remote registration");
  console.log(`Habitat ID: ${habitat.id}`);
  console.log(`Slug: ${habitat.habitatSlug}`);
  console.log(`Display name: ${habitat.displayName}`);
  console.log(`Catalog version: ${habitat.catalogVersion}`);
  console.log(`Status: ${habitat.status}`);
  console.log(`Last seen at: ${habitat.lastSeenAt ?? "never"}`);
}

const program = new Command();

program
  .name("habitat")
  .description("Register this Habitat CLI with Kepler and inspect its registration state.")
  .version(packageJson.version)
  .showHelpAfterError()
  .addHelpText(
    "after",
    `
Examples:
  habitat register --name "Artemis Ridge"
  habitat status
  habitat unregister

Notes:
  Registration state is stored locally in .habitat/registration.json.
  The CLI reads auth from KEPLER_PLANET_TOKEN, KEPLER_WORLD_TOKEN, or PLANET_TOKEN.
  The CLI reads the base URL from KEPLER_BASE_URL, KEPLER_WORLD_BASE_URL, or PLANET_SERVER_PUBLIC_BASE_URL.
`,
  );

program
  .command("register")
  .description("Register this habitat with Kepler.")
  .requiredOption("--name <name>", "Habitat display name")
  .action(async (options: { name: string }) => {
    const existingRegistration = loadRegistration();

    if (existingRegistration) {
      console.log(
        `This CLI is already registered as "${existingRegistration.displayName}" (${existingRegistration.habitatId}).`,
      );
      console.log("Run `habitat status` to inspect it or `habitat unregister` first.");
      process.exitCode = 1;
      return;
    }

    const habitatUuid = crypto.randomUUID();
    const response = await keplerRequest<RegistrationResponse>("POST", "/habitats/register", {
      habitatUuid,
      displayName: options.name,
    });

    const registration: LocalRegistration = {
      habitatId: response.habitatId,
      habitatUuid,
      displayName: options.name,
      baseUrl: getBaseUrl(),
      registeredAt: new Date().toISOString(),
      starterModules: response.starterModules,
      blueprints: response.blueprints,
    };

    saveRegistration(registration);
    console.log(`Registered "${registration.displayName}" with Kepler.`);
    printLocalRegistration(registration);
  });

program
  .command("status")
  .description("Show the current local and remote registration status.")
  .action(async () => {
    const registration = loadRegistration();

    if (!registration) {
      console.log("This CLI is not registered with Kepler yet.");
      console.log('Run `habitat register --name "<habitat name>"` to register.');
      return;
    }

    printLocalRegistration(registration);
    console.log("");

    const response = await keplerRequest<HabitatResponse>(
      "GET",
      `/habitats/${registration.habitatId}/registration`,
    );
    printRemoteHabitat(response.habitat);
  });

program
  .command("unregister")
  .description("Delete the remote habitat registration and clear local registration state.")
  .action(async () => {
    const registration = loadRegistration();

    if (!registration) {
      console.log("This CLI is not registered with Kepler.");
      return;
    }

    await keplerRequest<void>("DELETE", `/habitats/${registration.habitatId}`);
    deleteRegistrationFile();
    console.log(`Unregistered "${registration.displayName}" and removed local registration state.`);
  });

program.action(() => {
  program.outputHelp();
});

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
