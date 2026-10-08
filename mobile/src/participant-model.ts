import type { MapData } from "./SiteMap";
import { normalizeCrowd, type CrowdState, CROWD_COST } from "../../lib/crowd-model";
// ---- types (same shape as lib/plan.ts, kept local so the app doesn't pull in server code) ----
export type Transport = { mode: "train" | "shuttle" | "taxi" | "pickup"; ref_id: string; line: string; platform: string; depart: string | null };
export type Step = {
  action: string; gate_id: string; route_id: string; transport: Transport; group_meetup: string | null;
  wait_at: string | null; wait_until: string | null; volunteer_escort: boolean; notify_contact: boolean;
  reason: string; text_localised: string; reason_localised: string; arrive?: string;
};
export type Plan = Step & {
  source: string; alternatives: Step[]; escalate_text_localised: string; needs_human: boolean; needs_human_reason?: string | null;
  weather?: { status: string; source: string }; journey?: { main_tradeoff: string }; approved_by?: string;
};
export type LineupSet = { id: string; artist: string; stage_id: string; stage: string; start: string; end: string };
export type Bundle = {
  profile: {
    id: string;
    name: string;
    lang: string;
    group: { size: number } | null;
    location_at_end: string;
    home: { mode: string; booking?: string; zone?: string };
    access: { step_free: boolean; wheelchair: boolean };
  };

  plans: Record<string, Plan>;
  names: Record<string, string>;
  public_key: string;
  fetched_at: string;

  walking?: {
    routes: Record<
      string,
      {
        name: string;
        walk_min: number;
        from: string[];
        gate_id: string;
        covered: boolean;
        step_free: boolean;
      }
    >;

    connections: Record<
      string,
      {
        walk_min: number;
        covered: boolean;
        step_free: boolean;
      }
    >;
  };

  plan_updated_at?: string | null;

  map?: MapData;
  closed?: Record<string, { gates: string[]; places: string[]; storm: boolean; leave?: string }>;
  service_kinds?: Record<string, string>;
  lineup?: LineupSet[]; // must-see sets tonight (timetabled)
};


import { isRecord } from "../../lib/crowd-model";

const text = (v: unknown): v is string => typeof v === "string";
const nullableText = (v: unknown) => v == null || text(v);
const textList = (v: unknown): v is string[] => Array.isArray(v) && v.every(text);
const minutes = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

function readStep(v: unknown): Step | null {
  if (!isRecord(v) || !isRecord(v.transport)) return null;
  const tr = v.transport;
  if (!text(tr.mode) || !["train", "shuttle", "taxi", "pickup"].includes(tr.mode) ||
    ![tr.ref_id, tr.line, tr.platform].every(text) || !nullableText(tr.depart) ||
    ![v.action, v.gate_id, v.route_id, v.reason, v.text_localised, v.reason_localised].every(text) ||
    ![v.group_meetup, v.wait_at, v.wait_until].every(nullableText)) return null;
  return {
    ...v, transport: { ...tr, depart: tr.depart ?? null },
    group_meetup: v.group_meetup ?? null, wait_at: v.wait_at ?? null, wait_until: v.wait_until ?? null,
    volunteer_escort: v.volunteer_escort === true, notify_contact: v.notify_contact === true
  } as Step;
}

// Accept older bundles without walking metadata or alternatives. Reject broken core
// payloads before they can overwrite a working offline copy.
export function normalizeBundle(value: unknown, personId: string): Bundle | null {
  if (!isRecord(value) || !isRecord(value.profile) || value.profile.id !== personId ||
    !text(value.profile.name) || !text(value.profile.lang) || !isRecord(value.plans) ||
    !text(value.public_key) || !value.public_key) return null;
  const plans: Record<string, Plan> = {};
  for (const [key, raw] of Object.entries(value.plans)) {
    const step = readStep(raw);
    if (!step || !isRecord(raw)) continue;
    plans[key] = {
      ...step, source: text(raw.source) ? raw.source : "Fieldday Ops",
      alternatives: Array.isArray(raw.alternatives) ? raw.alternatives.flatMap(v => { const s = readStep(v); return s ? [s] : []; }) : [],
      needs_human: raw.needs_human === true,
      escalate_text_localised: text(raw.escalate_text_localised) ? raw.escalate_text_localised : "Go to the nearest info tent or show this screen to any volunteer."
    };
  }
  let walking: Bundle["walking"];
  if (isRecord(value.walking)) {
    const routes: NonNullable<Bundle["walking"]>["routes"] = {};
    const connections: NonNullable<Bundle["walking"]>["connections"] = {};
    for (const [id, r] of Object.entries(isRecord(value.walking.routes) ? value.walking.routes : {})) {
      if (isRecord(r) && text(r.name) && text(r.gate_id) && textList(r.from) && minutes(r.walk_min) &&
        typeof r.covered === "boolean" && typeof r.step_free === "boolean") routes[id] = r as typeof routes[string];
    }
    for (const [id, c] of Object.entries(isRecord(value.walking.connections) ? value.walking.connections : {})) {
      if (isRecord(c) && minutes(c.walk_min) && typeof c.covered === "boolean" && typeof c.step_free === "boolean") connections[id] = c as typeof connections[string];
    }
    walking = { routes, connections };
  }
  const closed: NonNullable<Bundle["closed"]> = {};
  for (const [key, c] of Object.entries(isRecord(value.closed) ? value.closed : {})) {
    if (isRecord(c) && textList(c.gates) && textList(c.places)) closed[key] = { gates: c.gates, places: c.places, storm: c.storm === true, ...(text(c.leave) ? { leave: c.leave } : {}) };
  }
  const group = value.profile.group;
  return {
    profile: {
      id: personId, name: value.profile.name, lang: value.profile.lang,
      location_at_end: text(value.profile.location_at_end) ? value.profile.location_at_end : "",
      group: isRecord(group) && typeof group.size === "number" ? { size: group.size } : null,
      home: isRecord(value.profile.home) && text(value.profile.home.mode)
        ? { mode: value.profile.home.mode, ...(text(value.profile.home.booking) ? { booking: value.profile.home.booking } : {}), ...(text(value.profile.home.zone) ? { zone: value.profile.home.zone } : {}) }
        : { mode: "unknown" },
      access: { step_free: isRecord(value.profile.access) && value.profile.access.step_free === true, wheelchair: isRecord(value.profile.access) && value.profile.access.wheelchair === true },
    },
    plans, public_key: value.public_key,
    names: Object.fromEntries(Object.entries(isRecord(value.names) ? value.names : {}).filter((entry): entry is [string, string] => text(entry[1]))),
    fetched_at: text(value.fetched_at) ? value.fetched_at : "",
    plan_updated_at: text(value.plan_updated_at) ? value.plan_updated_at : null,
    walking, closed, map: validMap(value.map) ? value.map : undefined,
    lineup: (Array.isArray(value.lineup) ? value.lineup : []).filter((x): x is LineupSet =>
      isRecord(x) && text(x.id) && text(x.artist) && text(x.stage_id) && text(x.stage) && text(x.start) && text(x.end)),
    service_kinds: Object.fromEntries(Object.entries(isRecord(value.service_kinds) ? value.service_kinds : {}).filter((entry): entry is [string, string] => text(entry[1]))),
  };
}

function validMap(v: unknown): v is MapData {
  const point = (p: unknown) => Array.isArray(p) && p.length === 2 && p.every(n => typeof n === "number" && Number.isFinite(n));
  const points = (p: unknown) => Array.isArray(p) && p.length > 0 && p.every(point);
  const positions = (p: unknown, labels: boolean) => Array.isArray(p) && p.every(x => isRecord(x) && text(x.id) && typeof x.x === "number" && typeof x.y === "number" && (!labels || text(x.label)));
  return isRecord(v) && Array.isArray(v.viewBox) && v.viewBox.length === 4 && v.viewBox.every(n => typeof n === "number" && Number.isFinite(n)) &&
    points(v.site) && isRecord(v.river) && text(v.river.label) && typeof v.river.y === "number" &&
    positions(v.gates, false) && positions(v.places, true) && positions(v.outside, true) &&
    isRecord(v.routes) && Object.values(v.routes).every(points) && isRecord(v.connections) && Object.values(v.connections).every(points) && isRecord(v.covered);
}

export function supportedZones(bundle: Bundle, plan: Plan): string[] {
  if (!bundle.walking) return []; // Legacy cache cannot establish alternative origins.
  return [...new Set([plan, ...plan.alternatives].flatMap(st => bundle.walking!.routes[st.route_id]?.from ?? []))];
}

export function resolveZone(bundle: Bundle, plan: Plan, requested: string): string {
  const zones = supportedZones(bundle, plan);
  return zones.includes(requested) ? requested : zones.includes(bundle.profile.location_at_end) ? bundle.profile.location_at_end : zones[0] ?? bundle.profile.location_at_end;
}

export function crowdAwarePlan(plan: Plan, rawCrowd: CrowdState, walking: Bundle["walking"], currentZone: string, closed?: NonNullable<Bundle["closed"]>[string]) {
  const crowd = normalizeCrowd(rawCrowd);
  const ranked = [plan, ...plan.alternatives].map((st, index) => ({ st, index }))
    .filter(({ st }) => {
      const route = walking?.routes[st.route_id];
      const destination = st.transport.mode === "train" ? "flinders_st" : st.transport.platform;
      return crowd[st.route_id]?.level !== "closed" && !closed?.gates.includes(st.gate_id) && !closed?.places.includes(destination) &&
        (!walking || (!!route && route.gate_id === st.gate_id && route.from.includes(currentZone)));
    })
    .sort((a, b) => (a.index * 3 + (CROWD_COST[crowd[a.st.route_id]?.level ?? "low"])) - (b.index * 3 + (CROWD_COST[crowd[b.st.route_id]?.level ?? "low"])));
  const best = ranked[0];
  return {
    plan: best ? { ...plan, ...best.st, alternatives: ranked.slice(1).map(x => x.st) } : { ...plan, alternatives: [] },
    unavailable: !best, changed: !!best && best.index !== 0,
    fromRoute: best && best.index !== 0 ? plan.route_id : null,
  };
}

export function displayTime(value: string | null | undefined): string {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false }) : "Unknown";
}
