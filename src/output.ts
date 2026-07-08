import { getModulePowerDrawKw, type HabitatRecord, type LocalModule, type LocalRegistration } from "./state";

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
