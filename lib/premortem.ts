// Pre-mortem: run every profile through every scenario, *with capacity*, and count people left with no viable plan.
// Deterministic so the number is trustworthy; Claude only explains the result (see /api/premortem/explain).
import fs from "node:fs";
import path from "node:path";
import { loadProfiles, scenarios, type Profile, type Service } from "./data";
import { allocate } from "./allocate";

const FIXES_PATH = path.join(process.cwd(), "data", "state", "premortem-fixes.json");

export function readFixes(): Service[] {
  return fs.existsSync(FIXES_PATH) ? JSON.parse(fs.readFileSync(FIXES_PATH, "utf8")) : [];
}
export function writeFixes(fixes: Service[]) {
  fs.mkdirSync(path.dirname(FIXES_PATH), { recursive: true });
  fs.writeFileSync(FIXES_PATH, JSON.stringify(fixes, null, 2));
}

type Group = { key: string; label: string; people: number; profiles: number; reason: string };
export type Contingency = { kind: "accessible" | "general" | "accessible_taxi"; depart: string; capacity: number; label: string; after: number };
export type ScenarioResult = { scenario: string; no_plan: number; groups: Group[]; constraint?: string; contingency?: Contingency | null };

function groupOf(p: Profile) {
  const need = p.access.wheelchair ? "Wheelchair users" : p.access.step_free ? "People needing step-free routes" : p.under_18 ? "Under-18s" : "Attendees";
  const home = p.home.mode === "train" ? `going home by train` : p.home.mode === "shuttle" ? `booked on a shuttle` : `being picked up`;
  return { key: `${need}|${p.home.mode}`, label: `${need} ${home}` };
}

export function runScenario(scenario: string, profiles: Profile[], extra: Service[]): ScenarioResult {
  // Same crowd allocation the plans use: gate places per wave + limited seats, most constrained people first.
  const { stuck } = allocate(scenario, profiles, extra);
  const groups = new Map<string, Group>();
  for (const s of stuck) {
    const g = groupOf(s.p);
    const cur = groups.get(g.key) ?? { ...g, people: 0, profiles: 0, reason: s.reason };
    cur.people += s.people;
    cur.profiles += 1;
    groups.set(g.key, cur);
  }
  return { scenario, no_plan: stuck.reduce((n, s) => n + s.people, 0), groups: [...groups.values()].sort((a, b) => b.people - a.people) };
}

// What's actually binding, in plain words, and one contingency we've verified clears it.
function diagnose(r: ScenarioResult, profiles: Profile[], fixes: Service[]): Pick<ScenarioResult, "constraint" | "contingency"> {
  if (!r.no_plan) return { constraint: undefined, contingency: null };
  const stepFree = r.groups.filter((g) => /wheelchair|step-free/i.test(g.label)).reduce((n, g) => n + g.people, 0);
  const seatsFull = r.groups.every((g) => g.reason.startsWith("Every way home they can use is full"));
  const candidates: Omit<Contingency, "after">[] =
    stepFree * 2 >= r.no_plan
      ? [{ kind: "accessible", depart: "23:05", capacity: Math.ceil(r.no_plan / 50) * 50, label: "accessible shuttle at Gate D" }]
      : [{ kind: "general", depart: "23:45", capacity: Math.ceil(r.no_plan / 100) * 100, label: "general shuttle from the Flinders St coach bays" }];
  const constraint = !seatsFull ? "Gate capacity before the last trains" : stepFree * 2 >= r.no_plan ? "Accessible transport capacity" : "Shuttle seat capacity";
  for (const c of candidates) {
    const stop = c.kind === "general" ? "coach_bays" : c.kind === "accessible" ? "shuttle_stop_batman_ave" : "accessible_taxi_rank";
    const trial: Service = { id: `trial_${c.kind}`, kind: c.kind, name: c.label, stop_id: stop, depart: c.depart, capacity: c.capacity };
    const after = runScenario(r.scenario, profiles, [...fixes, trial]).no_plan;
    if (after < r.no_plan) return { constraint, contingency: { ...c, after } };
  }
  return { constraint, contingency: null };
}

export function runPremortem() {
  const profiles = loadProfiles();
  const fixes = readFixes();
  return {
    total_people: profiles.reduce((n, p) => n + p.weight, 0),
    fixes,
    results: scenarios.precompute.map((sc) => {
      const r = runScenario(sc, profiles, fixes);
      return { ...r, ...diagnose(r, profiles, fixes) };
    }),
  };
}
export type PremortemReport = ReturnType<typeof runPremortem>;
