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
export type ScenarioResult = { scenario: string; no_plan: number; groups: Group[] };

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

export function runPremortem() {
  const profiles = loadProfiles();
  const fixes = readFixes();
  return {
    total_people: profiles.reduce((n, p) => n + p.weight, 0),
    fixes,
    results: scenarios.precompute.map((sc) => runScenario(sc, profiles, fixes)),
  };
}
export type PremortemReport = ReturnType<typeof runPremortem>;
