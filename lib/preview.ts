// What staff see before approving: who's affected, sample messages, simulated SMS, human-only flags.
import { loadProfiles, nameOf, type Profile } from "./data";
import { worldFor, closedPlaces } from "./options";
import { allocate } from "./allocate";
import { mapPayload } from "./map";
import { parseScenario, pickCachedScenario, partToCode, describePart } from "./scenario";
import { readPlanFile } from "./generate";
import { groupStuck, readFixes } from "./premortem";
import type { Plan } from "./plan";

// What each person is told = their first allocated chunk (gate, transport, wave). Compare scenario vs normal night.
type Alloc = ReturnType<typeof allocate>;
const told = (al: Alloc, id: string) => {
  const c = al.byPerson[id]?.[0];
  return c ? `${c.option.gate_id}|${c.option.route_id}|${c.option.transport.ref_id}|${c.option.transport.depart}|${c.delay}` : "none";
};
const peopleByGate = (al: Alloc) => {
  const g: Record<string, number> = {};
  for (const chunks of Object.values(al.byPerson)) for (const c of chunks) g[c.option.gate_id] = (g[c.option.gate_id] ?? 0) + c.people;
  return g;
};

export function planFor(personId: string, code: string): { plan: Plan | null; key: string; exact: boolean } {
  const file = readPlanFile(personId);
  if (!file) return { plan: null, key: "NORMAL", exact: false };
  const { key, exact } = pickCachedScenario(code, Object.keys(file.plans));
  return { plan: file.plans[key] ?? null, key, exact };
}

export function smsFor(p: Profile, plan: Plan) {
  if (!plan.notify_contact || p.home.mode !== "pickup") return null;
  return { to: `${p.name}'s ${p.home.contact}`, text: `Fieldday: pickup for ${p.name} has moved to ${nameOf(plan.transport.ref_id)}. ${p.name} has been told. Reply HELP for a volunteer.` };
}

export function buildPreview(code: string) {
  const parts = parseScenario(code);
  if (!parts) throw new Error(`Bad code ${code}`);
  const profiles = loadProfiles();
  const total = profiles.reduce((s, p) => s + p.weight, 0);

  const fixes = readFixes();
  const normal = allocate("NORMAL", profiles, fixes);
  const now = allocate(code, profiles, fixes);
  const affected = profiles.filter((p) => told(normal, p.id) !== told(now, p.id));
  // Net people gained/lost per gate vs a normal night, for the map badges.
  const before = peopleByGate(normal), after = peopleByGate(now);
  const gateDelta: Record<string, number> = {};
  for (const g of new Set([...Object.keys(before), ...Object.keys(after)])) gateDelta[g] = (after[g] ?? 0) - (before[g] ?? 0);
  // Busiest 30-minute wave per gate vs its limit: the allocator never lets this go over.
  const gateLoad = Object.fromEntries(Object.entries(now.gateLoad).map(([g, waves]) => [g, { peak: Math.max(...waves), cap: now.gateCap[g] }]));
  const w = worldFor(parts);
  const byPart = parts.map((part) => {
    const c = partToCode(part);
    const single = allocate(c, profiles, fixes);
    return { code: c, label: describePart(part), people: profiles.filter((p) => told(normal, p.id) !== told(single, p.id)).reduce((s, p) => s + p.weight, 0) };
  });

  const samples = profiles
    .filter((p) => p.hero)
    .map((p) => {
      const { plan, key, exact } = planFor(p.id, code);
      return { person_id: p.id, name: p.name, lang: p.lang, key, exact, plan };
    });

  // Coverage of pre-computed plans (prototype: heroes + a sample; production: everyone, batch job).
  let exact = 0, fallback = 0, missing = 0;
  const simulated_sms: { to: string; text: string }[] = [];
  const needs_human: { name: string; reason: string }[] = [];
  for (const p of profiles) {
    const r = planFor(p.id, code);
    if (!r.plan) { missing++; continue; }
    if (r.exact) exact++; else fallback++;
    const sms = smsFor(p, r.plan);
    if (sms) simulated_sms.push(sms);
    if (r.plan.needs_human) needs_human.push({ name: p.name, reason: r.plan.needs_human_reason ?? "flagged" });
  }

  return {
    code,
    total_people: total,
    affected_people: affected.reduce((s, p) => s + p.weight, 0),
    no_plan_people: now.stuck.reduce((n, x) => n + x.people, 0), // same crowd allocation as the pre-mortem
    no_plan_groups: groupStuck(now.stuck).map(({ label, people }) => ({ label, people })),
    waited_people: now.waited,
    gate_load: gateLoad,
    by_part: byPart,
    map: mapPayload(),
    closed_gates: [...w.closedGates],
    closed_places: closedPlaces(w),
    storm: w.storm,
    gate_delta: gateDelta,
    samples,
    coverage: { exact, fallback, missing, profiles: profiles.length },
    simulated_sms,
    needs_human,
  };
}
export type Preview = ReturnType<typeof buildPreview>;
