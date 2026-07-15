import { useEffect, useMemo, useState } from "react";
import {
  createRegistration,
  deleteRegistration,
  getHealth,
  getModules,
  getRegistration,
  getSolar,
  runTick,
  updateModuleStatus,
  type ApiError,
  type ModuleRecord,
  type RegistrationStatusResponse,
  type SolarStatusResponse,
  type TickResponse,
} from "./api";
import {
  getCurrentConsumptionKw,
  getCurrentGenerationKw,
  getNetEnergyKwh,
  getSolarBadgeTone,
  toBatteryCards,
  toModuleStatusCards,
  toSolarArrayCards,
} from "./models";

type DashboardState = {
  registration: RegistrationStatusResponse | null;
  modules: ModuleRecord[];
  solar: SolarStatusResponse | null;
};

type ThemeMode = "light" | "dark";

const presetTicks = [
  { label: "1 Tick", value: 1, hint: "Immediate step" },
  { label: "1 Minute", value: 60, hint: "60 ticks" },
  { label: "10 Minutes", value: 600, hint: "600 ticks" },
  { label: "1 Hour", value: 3600, hint: "3,600 ticks" },
] as const;

const navItems = ["Dashboard", "Power", "Modules", "Telemetry", "Operations"];

function formatNumber(value: number, digits = 2): string {
  return value.toFixed(digits);
}

function getStatusTone(status: string): "good" | "warn" | "danger" | "neutral" {
  switch (status) {
    case "active":
    case "online":
    case "clear":
      return "good";
    case "idle":
    case "dusty":
      return "warn";
    case "offline":
    case "damaged":
    case "storm":
    case "night":
      return "danger";
    default:
      return "neutral";
  }
}

function getErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as ApiError).message);
  }

  return "Something went wrong while contacting the Habitat backend.";
}

function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "light";
  }

  const savedTheme = window.localStorage.getItem("habitat-theme");
  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

async function loadDashboardState(): Promise<DashboardState> {
  await getHealth();

  const [registration, modulesResponse, solar] = await Promise.all([
    getRegistration(),
    getModules(),
    getSolar(),
  ]);

  return {
    registration,
    modules: modulesResponse.modules,
    solar,
  };
}

function App(): JSX.Element {
  const [dashboardState, setDashboardState] = useState<DashboardState | null>(null);
  const [lastTickResult, setLastTickResult] = useState<TickResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isUnregistering, setIsUnregistering] = useState(false);
  const [tickInFlight, setTickInFlight] = useState<number | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [customTickValue, setCustomTickValue] = useState("120");
  const [confirmValue, setConfirmValue] = useState("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [tickError, setTickError] = useState<string | null>(null);
  const [customTickError, setCustomTickError] = useState<string | null>(null);
  const [moduleMutationError, setModuleMutationError] = useState<string | null>(null);
  const [moduleStatusInFlight, setModuleStatusInFlight] = useState<string | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getInitialTheme());

  async function refreshDashboard(options?: { initial?: boolean }): Promise<void> {
    if (options?.initial) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const nextState = await loadDashboardState();
      setDashboardState(nextState);
      setApiError(null);
    } catch (error) {
      setApiError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    void refreshDashboard({ initial: true });
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    document.documentElement.dataset.theme = themeMode;
    window.localStorage.setItem("habitat-theme", themeMode);
  }, [themeMode]);

  const registration = dashboardState?.registration ?? null;
  const modules = dashboardState?.modules ?? [];
  const solar = dashboardState?.solar ?? null;
  const batteryCards = useMemo(() => toBatteryCards(modules), [modules]);
  const solarArrayCards = useMemo(() => toSolarArrayCards(modules), [modules]);
  const moduleCards = useMemo(() => toModuleStatusCards(modules), [modules]);
  const currentConsumptionKw = useMemo(() => getCurrentConsumptionKw(modules), [modules]);
  const currentGenerationKw = useMemo(() => getCurrentGenerationKw(modules), [modules]);
  const currentNetPowerKw = currentGenerationKw - currentConsumptionKw;
  const registrationRecord = registration?.registration ?? null;
  const solarTone = solar ? getSolarBadgeTone(solar.solarIrradiance.condition) : "neutral";
  const latestPowerSummary = lastTickResult?.powerSummary ?? null;

  async function handleRegister(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setApiError(null);

    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setApiError("Habitat display name is required.");
      return;
    }

    setIsRegistering(true);
    try {
      await createRegistration(trimmedName);
      setDisplayName("");
      await refreshDashboard();
    } catch (error) {
      setApiError(getErrorMessage(error));
    } finally {
      setIsRegistering(false);
    }
  }

  async function handleUnregister(): Promise<void> {
    if (!registrationRecord || confirmValue !== registrationRecord.displayName) {
      return;
    }

    setIsUnregistering(true);
    setApiError(null);

    try {
      await deleteRegistration();
      setShowConfirmDialog(false);
      setConfirmValue("");
      setLastTickResult(null);
      await refreshDashboard();
    } catch (error) {
      setApiError(getErrorMessage(error));
    } finally {
      setIsUnregistering(false);
    }
  }

  async function handleTickRequest(tickCount: number): Promise<void> {
    setTickError(null);
    setCustomTickError(null);
    setModuleMutationError(null);
    setTickInFlight(tickCount);

    try {
      const result = await runTick(tickCount);
      setLastTickResult(result);
      await refreshDashboard();
    } catch (error) {
      const message = getErrorMessage(error);
      setTickError(message);
    } finally {
      setTickInFlight(null);
    }
  }

  async function handleCustomTick(): Promise<void> {
    const parsed = Number(customTickValue);

    if (!Number.isInteger(parsed) || parsed <= 0) {
      setCustomTickError("Enter a positive whole-number tick value.");
      return;
    }

    await handleTickRequest(parsed);
  }

  async function handleModuleStatusChange(
    moduleId: string,
    nextStatus: "offline" | "online" | "active",
  ): Promise<void> {
    setModuleMutationError(null);
    setModuleStatusInFlight(moduleId);

    try {
      await updateModuleStatus(moduleId, nextStatus);
      await refreshDashboard();
    } catch (error) {
      setModuleMutationError(getErrorMessage(error));
    } finally {
      setModuleStatusInFlight(null);
    }
  }

  function toggleTheme(): void {
    setThemeMode((currentTheme) => (currentTheme === "light" ? "dark" : "light"));
  }

  if (isLoading) {
    return (
      <main className="screen shell">
        <div className="loading-state" role="status">
          <div className="spinner" />
          <div>
            <p className="eyebrow">Habitat Dashboard</p>
            <h1>Connecting to the Habitat backend</h1>
            <p>Loading registration, module, and solar state from the Hono API.</p>
          </div>
        </div>
      </main>
    );
  }

  if (!dashboardState && apiError) {
    return (
      <main className="screen shell">
        <section className="fatal-card">
          <p className="eyebrow">Backend Unreachable</p>
          <h1>Unable to load the Habitat dashboard</h1>
          <p>{apiError}</p>
          <button className="primary-button" onClick={() => void refreshDashboard({ initial: true })}>
            Retry connection
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="screen shell">
      <aside className="nav-rail">
        <div className="brand-mark">H</div>
        <div className="nav-copy">
          <p className="eyebrow">Habitat Ops</p>
          <h1>Dashboard</h1>
        </div>
        <nav>
          {navItems.map((item, index) => (
            <div
              className={`nav-item${index === 0 ? " is-active" : ""}`}
              key={item}
              aria-current={index === 0 ? "page" : undefined}
            >
              <span className="nav-glyph" />
              <span>{item}</span>
            </div>
          ))}
        </nav>
      </aside>

      <section className="content-column">
        <header className="hero-card">
          <div>
            <p className="eyebrow">Habitat Web Dashboard</p>
            <h2>Operate the habitat through the existing Hono API only</h2>
            <p>
              Registration, module state, solar conditions, and time advancement all flow through
              the current REST routes.
            </p>
          </div>
          <div className="hero-status">
            <button className="theme-toggle" onClick={toggleTheme} type="button">
              {themeMode === "light" ? "Dark mode" : "Light mode"}
            </button>
            <span className={`pill pill-${registrationRecord ? "good" : "warn"}`}>
              {registrationRecord ? "Registered" : "Awaiting registration"}
            </span>
            {isRefreshing ? <span className="muted-copy">Refreshing live data…</span> : null}
          </div>
        </header>

        {apiError ? (
          <section className="banner banner-danger" role="alert">
            <strong>API error:</strong> {apiError}
          </section>
        ) : null}

        <section className="dashboard-grid">
          <article className="card registration-card">
            <div className="card-header">
              <div>
                <p className="eyebrow">Registration</p>
                <h3>Habitat identity</h3>
              </div>
              {registrationRecord ? (
                <span className="pill pill-good">Kepler linked</span>
              ) : (
                <span className="pill pill-warn">Not registered</span>
              )}
            </div>

            {registrationRecord ? (
              <div className="stack">
                <dl className="stats-grid">
                  <div>
                    <dt>Name</dt>
                    <dd>{registrationRecord.displayName}</dd>
                  </div>
                  <div>
                    <dt>Habitat ID</dt>
                    <dd>{registrationRecord.habitatId}</dd>
                  </div>
                  <div>
                    <dt>Modules</dt>
                    <dd>{registration?.localModulesCount ?? 0}</dd>
                  </div>
                  <div>
                    <dt>Queued Builds</dt>
                    <dd>{registration?.queuedBuildsCount ?? 0}</dd>
                  </div>
                </dl>

                {registration?.remoteHabitat ? (
                  <div className="subpanel">
                    <p className="eyebrow">Remote status</p>
                    <div className="subpanel-row">
                      <span>{registration.remoteHabitat.habitatSlug}</span>
                      <span className={`pill pill-${getStatusTone(registration.remoteHabitat.status)}`}>
                        {registration.remoteHabitat.status}
                      </span>
                    </div>
                    <p className="muted-copy">
                      Catalog {registration.remoteHabitat.catalogVersion}
                    </p>
                  </div>
                ) : null}

                <button
                  className="ghost-danger-button"
                  onClick={() => setShowConfirmDialog(true)}
                >
                  Unregister habitat
                </button>
              </div>
            ) : (
              <form className="stack" onSubmit={handleRegister}>
                <p className="empty-copy">
                  This habitat has not been registered yet. Register it here without leaving the
                  dashboard.
                </p>
                <label className="field">
                  <span>Habitat display name</span>
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Artemis Ridge"
                    disabled={isRegistering}
                  />
                </label>
                <button className="primary-button" disabled={isRegistering}>
                  {isRegistering ? "Registering…" : "Register habitat"}
                </button>
              </form>
            )}
          </article>

          <article className="card power-card">
            <div className="card-header">
              <div>
                <p className="eyebrow">Power Overview</p>
                <h3>Current power and latest tick summary</h3>
              </div>
              {latestPowerSummary ? (
                <span className="pill pill-neutral">{latestPowerSummary.tickCount} ticks</span>
              ) : null}
            </div>

            <div className="metric-grid current-power-grid">
              <div className="metric-tile">
                <span>Current Generation</span>
                <strong>{formatNumber(currentGenerationKw)} kW</strong>
              </div>
              <div className="metric-tile">
                <span>Current Consumption</span>
                <strong>{formatNumber(currentConsumptionKw)} kW</strong>
              </div>
              <div className="metric-tile">
                <span>Current Net Power</span>
                <strong>{formatNumber(currentNetPowerKw)} kW</strong>
              </div>
              <div className="metric-tile">
                <span>Solar Condition</span>
                <strong>{solar?.solarIrradiance.condition ?? "unknown"}</strong>
              </div>
            </div>

            {latestPowerSummary ? (
              <div className="metric-layout">
                <div className="hero-metric">
                  <span>Latest Tick Net Energy</span>
                  <strong>{formatNumber(getNetEnergyKwh(latestPowerSummary))} kWh</strong>
                  <small>Generation minus demand from the latest tick run</small>
                </div>
                <div className="metric-grid">
                  <div className="metric-tile">
                    <span>Consumption</span>
                    <strong>{formatNumber(latestPowerSummary.totalEnergyDemandKwh)} kWh</strong>
                  </div>
                  <div className="metric-tile">
                    <span>Generation</span>
                    <strong>{formatNumber(latestPowerSummary.solar.totalGeneratedEnergyKwh)} kWh</strong>
                  </div>
                  <div className="metric-tile">
                    <span>Average Draw</span>
                    <strong>{formatNumber(latestPowerSummary.averagePowerDrawKw)} kW</strong>
                  </div>
                  <div className="metric-tile">
                    <span>Shortfall</span>
                    <strong>{formatNumber(latestPowerSummary.energyShortfallKwh)} kWh</strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <p>No tick-derived power summary yet.</p>
                <span>
                  Advance time with one of the controls to populate consumption, generation, net
                  energy, battery drain, and forced-offline details.
                </span>
              </div>
            )}
          </article>

          <article className="card tick-card">
            <div className="card-header">
              <div>
                <p className="eyebrow">Time Controls</p>
                <h3>Advance the simulation</h3>
              </div>
            </div>

            <div className="tick-button-grid">
              {presetTicks.map((tickOption) => (
                <button
                  className="tick-button"
                  key={tickOption.value}
                  disabled={tickInFlight !== null || !registrationRecord}
                  onClick={() => void handleTickRequest(tickOption.value)}
                >
                  <strong>{tickOption.label}</strong>
                  <span>{tickOption.hint}</span>
                </button>
              ))}
            </div>

            <div className="custom-tick-row">
              <label className="field">
                <span>Custom tick count</span>
                <input
                  value={customTickValue}
                  onChange={(event) => setCustomTickValue(event.target.value)}
                  inputMode="numeric"
                  disabled={tickInFlight !== null || !registrationRecord}
                />
              </label>
              <button
                className="primary-button"
                disabled={tickInFlight !== null || !registrationRecord}
                onClick={() => void handleCustomTick()}
              >
                {tickInFlight !== null ? "Advancing…" : "Run custom tick"}
              </button>
            </div>

            {!registrationRecord ? (
              <p className="muted-copy">Register the habitat before advancing time.</p>
            ) : null}

            {customTickError ? <p className="inline-error">{customTickError}</p> : null}
            {tickError ? (
              <section className="banner banner-danger" role="alert">
                <strong>Tick failed:</strong> {tickError}
              </section>
            ) : null}
          </article>

          <article className="card solar-card">
            <div className="card-header">
              <div>
                <p className="eyebrow">Solar Conditions</p>
                <h3>Current world irradiance</h3>
              </div>
              {solar ? (
                <span className={`pill pill-${solarTone}`}>
                  {solar.solarIrradiance.condition}
                </span>
              ) : null}
            </div>

            {solar ? (
              <div className="stack">
                <div className="hero-metric compact">
                  <span>Irradiance</span>
                  <strong>{solar.solarIrradiance.wPerM2} W/m²</strong>
                  <small>Live value from `GET /solar`</small>
                </div>

                <div className="solar-array-list">
                  {solarArrayCards.length > 0 ? (
                    solarArrayCards.map((arrayCard) => (
                      <div className="list-row" key={arrayCard.id}>
                        <div>
                          <strong>{arrayCard.name}</strong>
                          <p>{formatNumber(arrayCard.generationKw)} kW generation capacity</p>
                        </div>
                        <span className={`pill pill-${getStatusTone(arrayCard.status)}`}>
                          {arrayCard.status}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="empty-copy">No local small solar arrays are currently tracked.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="skeleton-block" />
            )}
          </article>

          <article className="card battery-card">
            <div className="card-header">
              <div>
                <p className="eyebrow">Battery State</p>
                <h3>Stored energy</h3>
              </div>
            </div>

            <div className="battery-list">
              {batteryCards.length > 0 ? (
                batteryCards.map((batteryCard) => (
                  <div className="battery-row" key={batteryCard.id}>
                    <div className="battery-copy">
                      <strong>{batteryCard.name}</strong>
                      <span>
                        {formatNumber(batteryCard.currentEnergyKwh)} / {formatNumber(batteryCard.capacityKwh)} kWh
                      </span>
                    </div>
                    <div className="progress-track" aria-label={`${batteryCard.name} battery fill`}>
                      <div
                        className={`progress-fill${batteryCard.percentFull < 20 ? " is-danger" : ""}`}
                        style={{ width: `${batteryCard.percentFull}%` }}
                      />
                    </div>
                    <span className="progress-label">{Math.round(batteryCard.percentFull)}%</span>
                  </div>
                ))
              ) : (
                <p className="empty-copy">No battery modules are currently available in local state.</p>
              )}
            </div>
          </article>

          <article className="card modules-card">
            <div className="card-header">
              <div>
                <p className="eyebrow">Modules</p>
                <h3>Current modules, status, and power usage</h3>
              </div>
            </div>

            {moduleMutationError ? (
              <section className="banner banner-danger" role="alert">
                <strong>Module update failed:</strong> {moduleMutationError}
              </section>
            ) : null}

            <div className="module-list">
              {moduleCards.length > 0 ? (
                moduleCards.map((moduleCard) => (
                  <div className="module-operator-row" key={moduleCard.id}>
                    <div className="module-copy">
                      <strong>{moduleCard.name}</strong>
                      <p className="muted-copy">{moduleCard.id}</p>
                    </div>
                    <div className="module-metrics">
                      <span className={`pill pill-${getStatusTone(moduleCard.status)}`}>
                        {moduleCard.status}
                      </span>
                      <span className="module-power">
                        {moduleCard.powerDrawKw === null
                          ? "No current power draw data"
                          : `${formatNumber(moduleCard.powerDrawKw)} kW draw`}
                      </span>
                      <div className="module-action-group">
                        {moduleCard.availableStatuses.map((statusOption) => {
                          const isCurrent = moduleCard.status === statusOption;

                          return (
                            <button
                              className={`secondary-button module-action-button${isCurrent ? " is-current" : ""}`}
                              key={statusOption}
                              disabled={
                                !registrationRecord ||
                                tickInFlight !== null ||
                                moduleStatusInFlight === moduleCard.id ||
                                isCurrent
                              }
                              onClick={() =>
                                void handleModuleStatusChange(moduleCard.id, statusOption)
                              }
                            >
                              {moduleStatusInFlight === moduleCard.id ? "Updating..." : statusOption}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="empty-copy">No local modules are available yet.</p>
              )}
            </div>
          </article>

          <article className="card details-card">
            <div className="card-header">
              <div>
                <p className="eyebrow">Tick Effects</p>
                <h3>What changed last run</h3>
              </div>
            </div>

            {lastTickResult ? (
              <div className="stack">
                <div className="subpanel">
                  <p className="eyebrow">Battery drain</p>
                  {lastTickResult.powerSummary.batteriesUsed.length > 0 ? (
                    lastTickResult.powerSummary.batteriesUsed.map((batterySummary) => (
                      <div className="subpanel-row" key={batterySummary.moduleId}>
                        <span>{batterySummary.moduleId}</span>
                        <span>{formatNumber(batterySummary.drainedEnergyKwh)} kWh drained</span>
                      </div>
                    ))
                  ) : (
                    <p className="muted-copy">No batteries were drained.</p>
                  )}
                </div>

                <div className="subpanel">
                  <p className="eyebrow">Forced offline</p>
                  {lastTickResult.powerSummary.forcedOfflineModuleIds.length > 0 ? (
                    lastTickResult.powerSummary.forcedOfflineModuleIds.map((moduleId) => (
                      <div className="subpanel-row" key={moduleId}>
                        <span>{moduleId}</span>
                        <span className="pill pill-danger">offline</span>
                      </div>
                    ))
                  ) : (
                    <p className="muted-copy">No modules were forced offline.</p>
                  )}
                </div>

                <div className="subpanel">
                  <p className="eyebrow">Build queue</p>
                  <div className="subpanel-row">
                    <span>Advanced builds</span>
                    <span>{lastTickResult.buildSummary.advancedBuilds}</span>
                  </div>
                  <div className="subpanel-row">
                    <span>Completed builds</span>
                    <span>{lastTickResult.buildSummary.completedBuilds.length}</span>
                  </div>
                  <div className="subpanel-row">
                    <span>Canceled builds</span>
                    <span>{lastTickResult.canceledBuilds.length}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <p>No simulation effects to report yet.</p>
                <span>Run a tick to inspect battery drain, forced offline modules, and build-queue changes.</span>
              </div>
            )}
          </article>
        </section>
      </section>

      {showConfirmDialog && registrationRecord ? (
        <div className="modal-backdrop" role="presentation">
          <section aria-modal="true" className="modal-card" role="dialog">
            <p className="eyebrow">Confirm unregister</p>
            <h3>Remove this habitat registration?</h3>
            <p>
              Type <strong>{registrationRecord.displayName}</strong> to confirm unregistering and
              clearing local registration state.
            </p>
            <label className="field">
              <span>Type habitat name</span>
              <input
                value={confirmValue}
                onChange={(event) => setConfirmValue(event.target.value)}
                disabled={isUnregistering}
              />
            </label>
            <div className="modal-actions">
              <button
                className="secondary-button"
                onClick={() => {
                  setShowConfirmDialog(false);
                  setConfirmValue("");
                }}
                disabled={isUnregistering}
              >
                Cancel
              </button>
              <button
                className="ghost-danger-button"
                onClick={() => void handleUnregister()}
                disabled={confirmValue !== registrationRecord.displayName || isUnregistering}
              >
                {isUnregistering ? "Unregistering…" : "Confirm unregister"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default App;
