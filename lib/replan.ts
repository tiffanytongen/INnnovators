// Live AI replanning for situations the pre-made contingency plans don't cover.
//
//   classify  — for each attendee with personal plans: is there a pre-made plan for exactly this situation,
//               is their closest pre-made plan still valid under the new restrictions, or are they affected?
//   propose   — affected attendees: group people with identical needs and options, ask Claude (via the
//               existing generator: rules-checked options + crowd allocation + validator) for a NEW plan
//               per group, re-validate it for every member. If Claude is unavailable or fails validation,
//               fall back to the pre-made plan only if it is still valid, otherwise flag for staff.
//   apply     — only after a named organizer approves: write the plans, then the trigger is sent.
// Nothing here invents gates, paths, times or capacity: options come from lib/options.ts.
import fs from "node:fs";
import path from "node:path";
import { loadProfiles, nameOf, textsContact, type Profile } from "./data";
import { closedPlaces, feasibleOptions, worldFor, type Option } from "./options";
import { generatePlan, readPlanFile, writePlan, PLANS_DIR } from "./generate";
import { describePart, parseScenario, pickCachedScenario } from "./scenario";
import { sourceFor, type Plan } from "./plan";
import { allocate, assignmentFor } from "./allocate";

const STATE_PATH = path.join(process.cwd(), "data", "state", "replan.json");

export type ReplanStatus = "premade" | "still_valid" | "affected" | "ai" | "contingency" | "manual";
export type ReplanItem = {
  person_id: string;
  name: string;
  status: ReplanStatus;
  from_key: string; // which pre-made plan they'd otherwise fall back to
  before: string | null; // that plan, in short
  after: string | null; // the new plan, in short
  why: string;
  group_size?: number;
  plan?: Plan; // proposed new plan (status "ai")
};
export type Proposal = {
  code: string;
  incident: string;
  created_at: string;
  model: string | null;
  claude_calls: number;
  ms: number;
  ai_error: string | null;
  applied_at?: string;
  items: ReplanItem[];
};

const sig = (o?: { gate_id: string; route_id: string; transport: { ref_id: string } }) =>
  o ? `${o.gate_id}|${o.route_id}|${o.transport.ref_id}` : "none";
const short = (id: string) => nameOf(id).replace(/ \(.*/, "");
const label = (key: string) => (key === "NORMAL" ? "Plan A" : (parseScenario(key) ?? []).map(describePart).join(" + "));

export function summarize(pl: Plan): string {
  const t = pl.transport;
  const name = short(t.ref_id) || t.line;
  const ride = t.mode === "train" ? `${t.line} line ${t.depart ?? ""}` : t.mode === "pickup" ? name : t.depart && !name.includes(t.depart) ? `${name} ${t.depart}` : name;
  return `Gate ${pl.gate_id.replace("gate_", "")} via ${short(pl.route_id)} → ${ride.trim()}`;
}

/** Is this (pre-made) plan still possible under the scenario's restrictions? If not, say why. */
export function validUnder(pl: Plan, p: Profile, code: string): { ok: boolean; why: string } {
  const parts = parseScenario(code) ?? [];
  const w = worldFor(parts);
  const closed = new Set(closedPlaces(w));
  if (w.closedGates.has(pl.gate_id)) return { ok: false, why: `Gate ${pl.gate_id.replace("gate_", "")} is closed` };
  if (w.closedRoutes.has(pl.route_id)) return { ok: false, why: `${short(pl.route_id)} is closed` };
  for (const id of [pl.transport.ref_id, pl.transport.platform, pl.wait_at]) {
    if (id && closed.has(id)) return { ok: false, why: `${short(id)} is closed` };
  }
  const opts: Option[] = feasibleOptions(p, code);
  const match = opts.find((o) => sig(o) === sig(pl) && (o.transport.depart === pl.transport.depart || pl.transport.mode === "pickup"));
  return match ? { ok: true, why: "" } : { ok: false, why: "That journey is no longer possible under the new restrictions" };
}

const personIdsWithPlans = () =>
  fs.existsSync(PLANS_DIR) ? fs.readdirSync(PLANS_DIR).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)) : [];

/** Deterministic triage (no AI). Only pre-made plans count: plans written by a live replan are ignored. */
export function classify(code: string): ReplanItem[] {
  const profiles = new Map(loadProfiles().map((p) => [p.id, p]));
  const items: ReplanItem[] = [];
  const alloc = allocate(code); // crowd allocation across everyone under the new restrictions (gate capacity)
  for (const id of personIdsWithPlans()) {
    const p = profiles.get(id);
    const file = readPlanFile(id);
    if (!p || !file) continue;
    const premadeKeys = Object.keys(file.plans).filter((k) => !file.plans[k].live);
    const { key, exact } = pickCachedScenario(code, premadeKeys);
    const fb = file.plans[key];
    const base = { person_id: id, name: p.name, from_key: key, before: fb ? summarize(fb) : null, after: null };
    if (exact) { items.push({ ...base, status: "premade", why: `Pre-made plan for ${label(key)}` }); continue; }
    if (!fb) { items.push({ ...base, status: "manual", why: "No saved plan for this attendee" }); continue; }
    const v = validUnder(fb, p, code);
    const assigned = assignmentFor(p, code, alloc);
    const moved = v.ok && assigned && assigned.option.gate_id !== fb.gate_id;
    if (!v.ok) items.push({ ...base, status: "affected", why: v.why });
    else if (moved) items.push({ ...base, status: "affected", why: `Gate capacity: crowd balancing now sends them to Gate ${assigned!.option.gate_id.replace("gate_", "")}` });
    else items.push({ ...base, status: "still_valid", why: `Their ${label(key)} plan isn't affected` });
  }
  return items;
}

// Attendees whose needs and recalculated options are identical get one Claude call between them.
function groupKey(p: Profile, code: string) {
  return JSON.stringify({
    lang: p.lang, home: p.home, access: p.access, u18: p.under_18, first: p.first_timer, group: !!p.group, loc: p.location_at_end,
    med: p.medical_flag, prefs: p.preferences ?? null, texts: textsContact(p), opts: feasibleOptions(p, code).map(sig),
  });
}

function fallbackOrManual(item: ReplanItem, p: Profile, code: string, reason: string): ReplanItem {
  const fb = readPlanFile(p.id)?.plans[item.from_key];
  const v = fb ? validUnder(fb, p, code) : { ok: false, why: "No saved plan" };
  return v.ok
    ? { ...item, status: "contingency", after: item.before, why: `${reason}. Their pre-made plan is still valid, so it's used.` }
    : { ...item, status: "manual", why: `${reason}. ${v.why}: staff must direct this attendee.` };
}

export async function propose(code: string, incident: string, log = console.log): Promise<Proposal> {
  const t0 = Date.now();
  const profiles = new Map(loadProfiles().map((p) => [p.id, p]));
  const items = classify(code);
  const affected = items.filter((i) => i.status === "affected");
  const groups = new Map<string, ReplanItem[]>();
  for (const it of affected) {
    const k = groupKey(profiles.get(it.person_id)!, code);
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }
  let model: string | null = null;
  let aiError: string | null = null;
  const out = new Map<string, ReplanItem>();

  await Promise.all([...groups.values()].map(async (members) => {
    const rep = profiles.get(members[0].person_id)!;
    let plan: Plan | null = null;
    let failed = "";
    try {
      plan = await generatePlan(rep, code, log, incident);
      if (!plan) failed = "No feasible way home under these restrictions";
      else if (plan.generated_by === "rules_fallback") { failed = "Claude's plans failed validation"; plan = null; }
    } catch (e) {
      failed = "AI unavailable";
      aiError = e instanceof Error ? e.message : String(e);
    }
    for (const it of members) {
      const p = profiles.get(it.person_id)!;
      if (!plan) { out.set(it.person_id, fallbackOrManual(it, p, code, failed)); continue; }
      model = plan.generated_by;
      // Same plan for an identical case, re-validated for this person (never trusted blindly).
      const mine: Plan = { ...structuredClone(plan), person_id: p.id, live: true, source: `Live AI replan · ${sourceFor(code)}` };
      const v = validUnder(mine, p, code);
      out.set(it.person_id, v.ok
        ? { ...it, status: "ai", plan: mine, after: summarize(mine), why: mine.reason, group_size: members.length }
        : fallbackOrManual(it, p, code, `New plan failed validation (${v.why})`));
    }
  }));

  const proposal: Proposal = {
    code, incident, created_at: new Date().toISOString(), model, claude_calls: groups.size, ms: Date.now() - t0, ai_error: aiError,
    items: items.map((i) => out.get(i.person_id) ?? i),
  };
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(proposal, null, 2));
  return proposal;
}

export function readProposal(code: string): Proposal | null {
  try {
    const p = JSON.parse(fs.readFileSync(STATE_PATH, "utf8")) as Proposal;
    return p.code === code && !p.applied_at ? p : null;
  } catch {
    return null;
  }
}

/**
 * Called by /api/approve, after a named organizer approves. Uses the AI proposal for this situation if there
 * is one; otherwise (no replan run, e.g. AI down) the deterministic triage: still-valid pre-made plans are
 * reused and anyone without a valid plan is flagged for staff. Never leaves an invalid plan looking safe.
 */
export function applyForApproval(code: string, approvedBy: string) {
  const profiles = new Map(loadProfiles().map((p) => [p.id, p]));
  const proposal = readProposal(code);
  const items = proposal?.items ?? classify(code).map((i) =>
    i.status === "affected" ? fallbackOrManual(i, profiles.get(i.person_id)!, code, "No live replan was run") : i);
  const approved_at = new Date().toISOString();
  const counts = { ai: 0, kept: 0, manual: 0 };
  for (const it of items) {
    if (it.status === "premade") continue;
    const fb = readPlanFile(it.person_id)?.plans[it.from_key];
    if (it.status === "ai" && it.plan) {
      writePlan({ ...it.plan, scenario: code, approved_by: approvedBy, approved_at });
      counts.ai++;
    } else if ((it.status === "still_valid" || it.status === "contingency") && fb) {
      writePlan({ ...fb, scenario: code, live: true, source: `Pre-made plan, still valid under: ${label(code)}`, approved_by: approvedBy, approved_at });
      counts.kept++;
    } else if (fb) {
      writePlan({ ...fb, scenario: code, live: true, manual_only: true, needs_human: true, needs_human_reason: it.why, approved_by: approvedBy, approved_at });
      counts.manual++;
    }
  }
  if (proposal) fs.writeFileSync(STATE_PATH, JSON.stringify({ ...proposal, applied_at: approved_at }, null, 2));
  return counts;
}

/** Demo reset: remove plans written by live replans so the same new situation can be replanned again. */
export function clearLivePlans() {
  for (const id of personIdsWithPlans()) {
    const file = readPlanFile(id);
    if (!file) continue;
    const keep = Object.fromEntries(Object.entries(file.plans).filter(([, pl]) => !pl.live));
    if (Object.keys(keep).length !== Object.keys(file.plans).length)
      fs.writeFileSync(path.join(PLANS_DIR, `${id}.json`), JSON.stringify({ ...file, plans: keep, updated_at: new Date().toISOString() }, null, 2));
  }
  fs.rmSync(STATE_PATH, { force: true });
}
