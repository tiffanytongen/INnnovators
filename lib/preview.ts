// What staff see before approving: who's affected, sample messages, simulated SMS, human-only flags.
import { loadProfiles, nameOf, type Profile } from "./data";
import { feasibleOptions, worldFor, closedPlaces } from "./options";
import { mapPayload } from "./map";
import { parseScenario, pickCachedScenario, partToCode, describePart } from "./scenario";
import { readPlanFile } from "./generate";
import { runScenario, readFixes } from "./premortem";
import type { Plan } from "./plan";

const sameExit = (a?: { gate_id: string; route_id: string; transport: { ref_id: string; depart: string | null } }, b?: typeof a) =>
  !!a && !!b && a.gate_id === b.gate_id && a.route_id === b.route_id && a.transport.ref_id === b.transport.ref_id && a.transport.depart === b.transport.depart;

function isAffected(p: Profile, code: string) {
  const before = feasibleOptions(p, "NORMAL")[0];
  const after = feasibleOptions(p, code)[0];
  return !sameExit(before, after);
}

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

  const affected = profiles.filter((p) => isAffected(p, code));
  // Where people leave from, before vs after (rule-ranked first choice), for the map.
  const gateDelta: Record<string, number> = {};
  for (const p of profiles) {
    const before = feasibleOptions(p, "NORMAL")[0]?.gate_id;
    const after = feasibleOptions(p, code)[0]?.gate_id;
    if (before === after) continue;
    if (before) gateDelta[before] = (gateDelta[before] ?? 0) - p.weight;
    if (after) gateDelta[after] = (gateDelta[after] ?? 0) + p.weight;
  }
  const w = worldFor(parts);
  const byPart = parts.map((part) => {
    const c = partToCode(part);
    return { code: c, label: describePart(part), people: profiles.filter((p) => isAffected(p, c)).reduce((s, p) => s + p.weight, 0) };
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
    no_plan_people: runScenario(code, profiles, readFixes()).no_plan, // same capacity-aware count as the pre-mortem
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
