// Typed access to the JSON files in /data. Server/script side only (uses fs).
import fs from "node:fs";
import path from "node:path";
import siteJson from "../data/site.json";
import transportJson from "../data/transport.json";
import scenariosJson from "../data/scenarios.json";
import timetableJson from "../data/timetable.json";

export type Connection = { id: string; walk_min: number; covered: boolean; step_free: boolean; note?: string; closed?: boolean };
export type Gate = { id: string; name: string; covered: boolean; step_free: boolean; accessible: boolean; capacity_per_hour: number; priority_access?: boolean; connects_to: Connection[] };
export type Route = { id: string; name: string; gate_id: string; from: string[]; covered: boolean; step_free: boolean; walk_min: number; closed?: boolean };
export type Place = { id: string; type: string; name: string; covered?: boolean; step_free?: boolean; staffed?: boolean; via_gates?: string[]; approved_waiting?: boolean; closed?: boolean };
/** Operational confirmations are optional; nominal capacity never establishes remaining seats. */
export type CapacityConfirmation = { confirmed_remaining?: number; capacity_confirmed_at?: string; capacity_valid_until?: string };
export type Train = { line: string; code: string; platform: number; departures: string[]; step_free?: boolean; boarding_buffer_minutes?: number; departure_capacity?: Record<string, CapacityConfirmation> };
export type Service = CapacityConfirmation & { id: string; kind: string; name: string; stop_id: string; depart: string; capacity: number; step_free?: boolean; boarding_buffer_minutes?: number; boarding_deadline?: string; cancelled?: boolean };

export type Profile = {
  id: string;
  name: string;
  age: number;
  lang: string;
  home: { mode: "train"; line: string } | { mode: "shuttle"; booking: string } | { mode: "pickup"; zone: string; contact: string };
  access: { wheelchair: boolean; step_free: boolean; low_vision: boolean; sensory: boolean };
  under_18: boolean;
  first_timer: boolean;
  medical_flag: string | null;
  group: { id: string; size: number } | null;
  location_at_end: string;
  must_see: string[];
  weight: number;
  hero?: boolean;
  notes?: string;
  /** From ticket checkout: where they're heading (informational). */
  home_suburb?: string;
  /** Multiply the route's reference walking duration; 1.5 means 50% more time. */
  walking_pace_multiplier?: number;
  preferences?: { prefer_shelter?: boolean; max_walk_minutes?: number; seat_required?: boolean; ready_at?: string; latest_arrival?: string };
};

export const site = siteJson as unknown as { gates: Gate[]; routes: Route[]; places: Place[]; meetup_points: string[] };
export const transport = transportJson as unknown as {
  station_id: string;
  trains: Train[];
  shuttles: Service[];
  taxis: Service[];
  pickup: { zone_id: string; window: string }[];
};
export const scenarios = scenariosJson as unknown as {
  types: { type: string; code_pattern: string; label: string; effects: string[]; emp_section: string }[];
  demo_scenario: string;
  precompute: string[];
};
export const timetable = timetableJson as unknown as {
  stages: { id: string; name: string }[];
  sets: { id: string; day: string; stage_id: string; artist: string; start: string; end: string; headliner?: boolean }[];
};

// Profiles can grow at runtime (the sign-up form appends to data/profiles.json), so read fresh each time.
const PROFILES_PATH = path.join(process.cwd(), "data", "profiles.json");
export function loadProfiles(): Profile[] {
  return JSON.parse(fs.readFileSync(PROFILES_PATH, "utf8")).profiles;
}
export function saveProfiles(profiles: Profile[]) {
  const raw = JSON.parse(fs.readFileSync(PROFILES_PATH, "utf8"));
  fs.writeFileSync(PROFILES_PATH, JSON.stringify({ ...raw, profiles }, null, 2));
}

export const gateById = (id: string) => site.gates.find((g) => g.id === id);
export const routeById = (id: string) => site.routes.find((r) => r.id === id);
export const placeById = (id: string) => site.places.find((p) => p.id === id);
export const trainByLine = (line: string) => transport.trains.find((t) => t.line === line);
export const serviceById = (id: string) => [...transport.shuttles, ...transport.taxis].find((s) => s.id === id);

export function nameOf(id: string | null | undefined): string {
  if (!id) return "";
  return gateById(id)?.name ?? routeById(id)?.name ?? placeById(id)?.name ?? serviceById(id)?.name ?? id;
}

// "22:52" <-> minutes. Hours past 24 are fine ("24:07").
export const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
export const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
