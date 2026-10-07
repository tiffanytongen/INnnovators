// Node-only backend module: the node:crypto import also prevents client bundling.
// API reference: https://www.meteosource.com/documentation
// Verified schemas: /api/v1/free/openapi.json and /api/v1/standard/openapi.json.
import { createHash } from "node:crypto";
import type { Forecast, WeatherInterval } from "./weather-types";

type JourneyWindow = { start: string | null; end: string | null };
type Environment = Record<string, string | undefined>;
type Location = Forecast["location"];
const HOUR = 60 * 60 * 1000;
const MIN_CACHE_MS = 5 * 60 * 1000; // At most 288 calls/day per server/location; Free allows 400.
const DEFAULT_CACHE_MS = 15 * 60 * 1000;
const MAX_FRESH_MS = 90 * 60 * 1000;
const SOURCE = "Meteosource";
const UNITS: Forecast["units"] = {
  temperature: "°C", precipitation: "mm/h", wind: "m/s", probability: "%",
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
function number(value: unknown, min = -Infinity, max = Infinity): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
}
function coordinate(value: string | undefined, bound: number): number | null {
  if (!value?.trim()) return null;
  return number(Number(value), -bound, bound);
}
function isoMillis(value: string | null): number | null {
  if (!value || !/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function blank(location: Location, reason: string): Forecast {
  return {
    status: "unavailable", source: SOURCE, simulated: false, retrieved_at: null,
    timezone: "UTC", units: { ...UNITS }, location, intervals: [], reason,
  };
}

/** Request UTC explicitly: Meteosource dates usually omit their timezone offset. */
export function normalizeMeteosource(
  raw: unknown, location: Location, retrievedAt: string,
): Forecast {
  const root = record(raw);
  // Refuse to silently interpret local timestamps as UTC or imperial values as metric.
  if (root.timezone !== "UTC" || root.units !== "metric") {
    return { ...blank(location, "The weather provider did not confirm UTC timestamps and metric units."), retrieved_at: retrievedAt };
  }
  const data = record(root.hourly).data;
  const byStart = new Map<string, WeatherInterval>();
  if (Array.isArray(data)) for (const value of data) {
    const row = record(value);
    if (typeof row.date !== "string") continue;
    const date = /(?:Z|[+-]\d{2}:\d{2})$/i.test(row.date) ? row.date : `${row.date}Z`;
    const start = isoMillis(date);
    if (start === null) continue;
    const precipitation = record(row.precipitation);
    const wind = record(row.wind);
    const probability = record(row.probability);
    const interval: WeatherInterval = {
      start: new Date(start).toISOString(), end: new Date(start + HOUR).toISOString(),
      summary: typeof row.summary === "string" && row.summary.trim() ? row.summary.slice(0, 500) : null,
      precipitation: number(precipitation.total, 0),
      // Free provides neither probability nor gusts. Never turn their absence into zero.
      // Standard's probability is for precipitation (including snow), so only call it rain
      // when the provider identifies the precipitation as rain.
      rain_probability: precipitation.type === "rain" ? number(probability.precipitation, 0, 100) : null,
      temperature: number(row.temperature), wind_speed: number(wind.speed, 0), wind_gusts: number(wind.gusts, 0),
    };
    byStart.set(interval.start, interval);
  }
  const intervals = [...byStart.values()].sort((a, b) => a.start.localeCompare(b.start));
  if (!intervals.length) return { ...blank(location, "No usable hourly forecast was returned."), retrieved_at: retrievedAt };
  const hasEmptyInterval = intervals.some((interval) =>
    interval.summary === null && interval.precipitation === null && interval.temperature === null && interval.wind_speed === null);
  return {
    status: hasEmptyInterval ? "partial" : "available", source: SOURCE, simulated: false,
    retrieved_at: retrievedAt, timezone: "UTC", units: { ...UNITS }, location, intervals,
    reason: hasEmptyInterval ? "Some forecast hours contain no usable weather observations; missing values are unknown." : null,
  };
}

/** Only return hours that overlap this actual dated journey; never substitute today's weather. */
export function forecastForWindow(forecast: Forecast, window: JourneyWindow): Forecast {
  const start = isoMillis(window.start);
  const end = isoMillis(window.end);
  if (start === null || end === null || end <= start) {
    return { ...forecast, status: "unavailable", intervals: [], reason: "A valid dated journey window with timezone is required to check weather." };
  }
  if (!forecast.intervals.length) return { ...forecast, intervals: [] };
  const intervals = forecast.intervals.filter((item) => Date.parse(item.start) < end && Date.parse(item.end) > start);
  if (!intervals.length) {
    return {
      ...forecast, status: "unavailable", intervals: [],
      reason: `The journey is outside the available hourly forecast horizon (${forecast.intervals[0].start} to ${forecast.intervals[forecast.intervals.length - 1].end}). No forecast is available for this journey.`,
    };
  }
  let coveredUntil = start;
  for (const interval of intervals) {
    if (Date.parse(interval.start) > coveredUntil) break;
    coveredUntil = Math.max(coveredUntil, Date.parse(interval.end));
  }
  if (coveredUntil < end && forecast.status !== "stale") {
    return { ...forecast, status: "partial", intervals, reason: "Hourly weather covers only part of this journey. Conditions outside the supplied intervals are unknown." };
  }
  return { ...forecast, intervals };
}

type CacheEntry = {
  forecast: Forecast | null;
  freshUntil: number;
  retryAt: number;
  failure: string | null;
  inFlight: Promise<void> | null;
};
type Dependencies = { fetch?: typeof fetch; now?: () => number; env?: () => Environment };

/** Each client shares one forecast across attendee windows and coalesces concurrent requests. */
export function createWeatherClient(dependencies: Dependencies = {}) {
  const fetcher = dependencies.fetch ?? globalThis.fetch;
  const now = dependencies.now ?? Date.now;
  const env = dependencies.env ?? (() => process.env);
  const cache = new Map<string, CacheEntry>();

  return async function getForecast(window: JourneyWindow): Promise<Forecast> {
    const config = env();
    const location = { latitude: coordinate(config.FESTIVAL_LATITUDE, 90), longitude: coordinate(config.FESTIVAL_LONGITUDE, 180) };
    const start = isoMillis(window.start);
    const end = isoMillis(window.end);
    if (start === null || end === null || end <= start) return blank(location, "Festival date and a valid dated journey window with timezone are required. Weather has not been requested.");
    if (location.latitude === null || location.longitude === null) return blank(location, "Festival coordinates are not configured. Weather is unavailable.");
    const tier = (config.METEOSOURCE_TIER ?? "free").trim().toLowerCase();
    if (!["free", "startup", "standard"].includes(tier)) return blank(location, "METEOSOURCE_TIER must be free, startup or standard for this hourly weather integration.");
    const apiKey = config.METEOSOURCE_API_KEY?.trim();
    if (!apiKey) return blank(location, "The server's Meteosource API key is not configured. Weather is unavailable.");

    // Keys never appear in URLs, cache identifiers, errors or returned JSON.
    const credentialFingerprint = createHash("sha256").update(apiKey).digest("hex");
    const cacheKey = `${tier}:${location.latitude}:${location.longitude}:${credentialFingerprint}`;
    let entry = cache.get(cacheKey);
    if (!entry) {
      if (cache.size >= 16) {
        const expendable = [...cache.entries()].find(([, item]) => !item.inFlight);
        if (expendable) cache.delete(expendable[0]);
      }
      entry = { forecast: null, freshUntil: 0, retryAt: 0, failure: null, inFlight: null };
      cache.set(cacheKey, entry);
    }
    const active = entry;
    if (active.inFlight) await active.inFlight;
    else if (now() >= active.retryAt && (!active.forecast || now() >= active.freshUntil)) {
      active.inFlight = (async () => {
        const requestedAt = now();
        const requestedTtl = Number(config.METEOSOURCE_CACHE_SECONDS);
        const ttl = Number.isFinite(requestedTtl) && requestedTtl > 0
          ? Math.min(MAX_FRESH_MS, Math.max(MIN_CACHE_MS, requestedTtl * 1000)) : DEFAULT_CACHE_MS;
        active.retryAt = requestedAt + MIN_CACHE_MS;
        const timeout = Number(config.METEOSOURCE_TIMEOUT_MS);
        const timeoutMs = Number.isFinite(timeout) && timeout > 0 ? Math.min(20_000, timeout) : 8_000;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const url = new URL(`https://www.meteosource.com/api/v1/${tier}/point`);
          url.search = new URLSearchParams({
            lat: String(location.latitude), lon: String(location.longitude), sections: "hourly",
            timezone: "UTC", language: "en", units: "metric",
          }).toString();
          const response = await fetcher(url, {
            headers: { "X-API-Key": apiKey, Accept: "application/json" },
            cache: "no-store", signal: controller.signal, redirect: "error",
          });
          if (!response.ok) {
            active.failure = response.status === 429 || response.status === 402
              ? "Meteosource's request limit was reached. Weather refresh is temporarily paused."
              : response.status === 403 || response.status === 401
                ? "Meteosource rejected the server's API credentials or subscription."
                : "Meteosource is unavailable. The forecast could not be refreshed.";
            const retryAfter = response.headers.get("Retry-After");
            const retrySeconds = retryAfter === null ? NaN : Number(retryAfter);
            const retryTimestamp = retryAfter === null ? NaN : Date.parse(retryAfter);
            if (Number.isFinite(retrySeconds)) active.retryAt = Math.max(active.retryAt, requestedAt + retrySeconds * 1000);
            else if (Number.isFinite(retryTimestamp)) active.retryAt = Math.max(active.retryAt, retryTimestamp);
            // Daily reset timezone is not documented. A 24h pause avoids hammering a depleted quota.
            if (response.status === 402) active.retryAt = Math.max(active.retryAt, requestedAt + 24 * HOUR);
            return;
          }
          const forecast = normalizeMeteosource(await response.json(), location, new Date(now()).toISOString());
          if (forecast.status === "unavailable") {
            active.failure = forecast.reason;
            return;
          }
          active.forecast = forecast;
          active.failure = null;
          const expires = Date.parse(response.headers.get("Expires") ?? "");
          // Never present a response past the provider's expiry as current. Min retry spacing
          // can leave a brief explicitly stale period if Expires is under five minutes.
          active.freshUntil = Math.min(requestedAt + MAX_FRESH_MS, Number.isFinite(expires) ? expires : requestedAt + ttl);
          active.retryAt = Math.max(requestedAt + MIN_CACHE_MS, active.freshUntil);
        } catch {
          // Do not expose provider errors/request objects: they may contain credentials.
          active.failure = controller.signal.aborted
            ? "Meteosource timed out. The forecast could not be refreshed."
            : "Meteosource could not be reached or returned invalid data. Weather could not be refreshed.";
        } finally { clearTimeout(timer); }
      })();
      try { await active.inFlight; } finally { active.inFlight = null; }
    }
    if (!active.forecast) return blank(location, active.failure ?? "Weather is temporarily unavailable.");
    const current = now() >= active.freshUntil
      ? { ...active.forecast, status: "stale" as const, reason: `${active.failure ?? "The cached forecast has expired."} This is old weather evidence; do not treat it as current conditions.` }
      : active.forecast;
    return forecastForWindow(current, window);
  };
}

// A shared process-level client also survives Next development module reloads. Multi-instance
// deployments should supply a shared cache/rate limiter before scaling beyond one backend.
const shared = globalThis as typeof globalThis & { planBWeatherClient?: ReturnType<typeof createWeatherClient> };
export const getForecast = shared.planBWeatherClient ??= createWeatherClient();
