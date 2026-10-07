// Safe to import as types from mobile/UI code. Provider credentials live in weather.ts.
export type WeatherInterval = {
  start: string;
  end: string;
  summary: string | null;
  precipitation: number | null;
  /** Rain probability (%) only when the provider identifies rain; unknown otherwise. */
  rain_probability: number | null;
  temperature: number | null;
  wind_speed: number | null;
  wind_gusts: number | null;
};

export type Forecast = {
  status: "available" | "partial" | "unavailable" | "stale";
  source: string;
  simulated: boolean;
  retrieved_at: string | null;
  timezone: string;
  units: { temperature: string; precipitation: string; wind: string; probability: string };
  location: { latitude: number | null; longitude: number | null };
  intervals: WeatherInterval[];
  reason: string | null;
};
