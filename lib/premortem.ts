// Pre-mortem: run every profile through every scenario, *with capacity*, and count people left with no viable plan.
// Deterministic so the number is trustworthy; Claude only explains the result (see /api/premortem/explain).
import fs from "node:fs";
import path from "node:path";
import { loadProfiles, scenarios, transport, type Profile, type Service } from "./data";
import { feasibleOptions, type Option } from "./options";

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

function whyStuck(p: Profile, options: Option[], seatsLeft: Map<string, number>): string {
  if (options.length === 0) {
    const sf = p.access.step_free || p.access.wheelchair;
    return sf
      ? "No step-free route that is open (and covered, if storming) reaches their way home"
      : "No open route reaches their way home in time";
  }
  const pools = [...new Set(options.map((o) => o.transport.ref_id))];
  return `Every option is a limited-seat service and all are full (${pools.map((id) => `${id}: ${Math.max(0, seatsLeft.get(id) ?? 0)} left`).join(", ")})`;
}

export function runScenario(scenario: string, profiles: Profile[], extra: Service[]): ScenarioResult {
  const services = [...transport.shuttles, ...transport.taxis, ...extra];
  const seatsLeft = new Map(services.map((s) => [s.id, s.capacity]));
  const limited = (o: Option) => seatsLeft.has(o.transport.ref_id);

  const rows = profiles.map((p) => ({ p, options: feasibleOptions(p, scenario, extra) }));
  const stuck: { p: Profile; reason: string; people: number }[] = [];
  const needSeat: typeof rows = [];

  for (const r of rows) {
    if (r.options.length === 0) stuck.push({ p: r.p, reason: whyStuck(r.p, [], seatsLeft), people: r.p.weight });
    else if (r.options.some((o) => !limited(o))) continue; // train / pickup: no seat limit modelled
    else needSeat.push(r);
  }

  // People with existing bookings keep them first; then the most constrained (fewest options) choose.
  const booked = (r: (typeof rows)[number]) => r.p.home.mode === "shuttle" && r.options.some((o) => o.transport.ref_id === (r.p.home as { booking: string }).booking);
  needSeat.sort((a, b) => Number(booked(b)) - Number(booked(a)) || Number(!!b.p.hero) - Number(!!a.p.hero) || a.options.length - b.options.length);
  for (const r of needSeat) {
    let remaining = r.p.weight;
    for (const o of r.options) {
      const left = seatsLeft.get(o.transport.ref_id)!;
      const take = Math.min(left, remaining);
      seatsLeft.set(o.transport.ref_id, left - take);
      remaining -= take;
      if (!remaining) break;
    }
    if (remaining) stuck.push({ p: r.p, reason: whyStuck(r.p, r.options, seatsLeft), people: remaining });
  }

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
