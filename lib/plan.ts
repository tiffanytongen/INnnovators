// Plan schema (what Claude must return) + validator (what we accept).
import { z } from "zod";
import { site, placeById, serviceById, scenarios, toTime, type Profile } from "./data";
import { feasibleOptions, worldFor, closedPlaces, leaveTime, type Option } from "./options";
import { assignmentFor } from "./allocate";
import { parseScenario } from "./scenario";
import type { Forecast } from "./weather-types";

export type JourneySelection = {
  option_id: string;
  departure_id: string;
  leave_at: string;
  boarding_deadline: string | null;
  main_tradeoff: string;
  forecast_times: string[];
  missing_information: string[];
};

const TransportSchema = z.object({
  mode: z.enum(["train", "shuttle", "taxi", "pickup"]),
  ref_id: z.string(),
  line: z.string(),
  platform: z.string(),
  depart: z.string().nullable(),
});

const Step = {
  action: z.string().describe("One short imperative sentence in plain English, e.g. 'Leave now via Gate C'"),
  gate_id: z.string(),
  route_id: z.string(),
  transport: TransportSchema,
  group_meetup: z.string().nullable().describe("Meetup point id if separated from group, else null"),
  wait_at: z.string().nullable().describe("Place id to wait at before moving, else null"),
  wait_until: z.string().nullable().describe("HH:MM to stop waiting, else null"),
  volunteer_escort: z.boolean(),
  reason: z.string().describe("English. The trade-off in one or two short sentences"),
  text_localised: z.string().describe("The action, in the person's language. Calm, short."),
  reason_localised: z.string().describe("The reason, in the person's language. Short."),
};

export const ClaudePlanSchema = z.object({
  ...Step,
  alternatives: z.array(z.object(Step)).describe("1-3 other options from the candidate list, best first"),
  escalate_text_localised: z.string().describe("In the person's language: 'Go to the nearest info tent or show this screen to any volunteer.'"),
  confidence: z.enum(["high", "medium", "low"]),
  needs_human: z.boolean(),
  needs_human_reason: z.string().nullable(),
});
export type ClaudePlan = z.infer<typeof ClaudePlanSchema>;

export type PlanStep = z.infer<z.ZodObject<typeof Step>> & { notify_contact: boolean; arrive: string; journey?: JourneySelection };
export type Plan = PlanStep & {
  person_id: string;
  scenario: string;
  source: string;
  lang: string;
  alternatives: PlanStep[];
  escalate_text_localised: string;
  confidence: "high" | "medium" | "low";
  needs_human: boolean;
  needs_human_reason: string | null;
  generated_by: string; // model id, or "rules_fallback"
  weather?: Forecast;
  version?: number;
  approved_at?: string;
  approved_by?: string;
  approval_id?: string;
};

export function sourceFor(scenario: string): string {
  const parts = parseScenario(scenario) ?? [];
  const types = [...new Set(parts.map((p) => p.type))];
  const sections = types.map((t) => scenarios.types.find((s) => s.type === t)?.emp_section).filter(Boolean);
  return sections.length ? `Fieldday Ops · ${sections.join(", ")}` : "Fieldday Ops · Plan A (normal night)";
}

const HHMM = /\b([01]?\d|2[0-4])[:：.]([0-5]\d)\b/g;

function checkStep(step: z.infer<z.ZodObject<typeof Step>>, options: Option[], closed: Set<string>, extraTimes: string[], label: string, errors: string[]): Option | null {
  const match = options.find(
    (o) => o.gate_id === step.gate_id && o.route_id === step.route_id && o.transport.ref_id === step.transport.ref_id && o.transport.depart === step.transport.depart,
  );
  if (!match) {
    errors.push(`${label}: gate_id=${step.gate_id}, route_id=${step.route_id}, transport.ref_id=${step.transport.ref_id}, depart=${step.transport.depart} is not one of the candidate options. Copy gate_id, route_id and transport exactly from one candidate.`);
  }
  if (step.group_meetup && (!site.meetup_points.includes(step.group_meetup) || closed.has(step.group_meetup)))
    errors.push(`${label}: group_meetup "${step.group_meetup}" is not an open meetup point. Valid: ${site.meetup_points.filter((m) => !closed.has(m)).join(", ")}`);
  if (step.wait_at && (!placeById(step.wait_at) || closed.has(step.wait_at))) errors.push(`${label}: wait_at "${step.wait_at}" is not an open place id.`);
  if (step.wait_until && !/^\d{2}:\d{2}$/.test(step.wait_until)) errors.push(`${label}: wait_until must be HH:MM or null.`);
  if (match && step.wait_until && step.wait_until > match.latest_leave)
    errors.push(`${label}: wait_until ${step.wait_until} is too late — they must start moving by ${match.latest_leave} to make it.`);
  // Translation guard: any time written in the localised text must be a real time from the fixed fields.
  // Accept 24h or 12h forms ("22:52" or "10:52").
  const allowed = new Set<string>();
  for (const t of [match?.transport.depart, step.wait_until, match?.arrive, ...extraTimes]) {
    if (!t) continue;
    const [h, m] = t.split(":").map(Number);
    allowed.add(`${h}:${m}`).add(`${h % 12 || 12}:${m}`);
  }
  for (const m of `${step.action} ${step.reason} ${step.text_localised} ${step.reason_localised}`.matchAll(HHMM)) {
    if (!allowed.has(`${Number(m[1])}:${Number(m[2])}`)) errors.push(`${label}: text mentions ${m[0]}, which is not a time from the fixed fields or the scenario. Only use those times.`);
  }
  return match ?? null;
}

/** Validate Claude's plan against the data. Returns the accepted Plan or a list of errors to feed back. */
export function validatePlan(raw: ClaudePlan, profile: Profile, scenario: string, model: string): { plan?: Plan; errors: string[] } {
  const errors: string[] = [];
  const parts = parseScenario(scenario)!;
  const assigned = assignmentFor(profile, scenario); // crowd allocation across everyone
  const options = assigned ? assigned.options : feasibleOptions(profile, parts);
  const closed = new Set(closedPlaces(worldFor(parts)));

  const w = worldFor(parts);
  const start = toTime(leaveTime(profile, w) + (assigned?.delay ?? 0));
  // Times the text may mention: any real departure among the options, their original booking, leave time, storm time.
  const booked = profile.home.mode === "shuttle" ? serviceById(profile.home.booking)?.depart : undefined;
  const extraTimes = [
    toTime(leaveTime(profile, w)),
    start,
    ...parts.flatMap((p) => (p.type === "STORM" ? [p.at] : [])),
    ...options.flatMap((o) => [o.transport.depart, o.arrive, o.latest_leave]),
    booked,
  ].filter((t): t is string => !!t);
  const main = checkStep(raw, options, closed, extraTimes, "main plan", errors);
  const alts = raw.alternatives.map((a, i) => ({ a, o: checkStep(a, options, closed, extraTimes, `alternatives[${i}]`, errors) }));
  // Crowd allocation: the main plan must be the gate/transport/wave this person was given, so no gate is overloaded.
  // (The allocator already keeps bookings and pickup points wherever there's room.)
  if (assigned) {
    const a = assigned.option;
    if (raw.gate_id !== a.gate_id || raw.transport.ref_id !== a.transport.ref_id || raw.transport.depart !== a.transport.depart)
      errors.push(`main plan: must be the ASSIGNED option (gate_id=${a.gate_id}, transport.ref_id=${a.transport.ref_id}, depart=${a.transport.depart}). Other gates are full; put other options in alternatives.`);
    if (assigned.delay > 0 && (!raw.wait_until || raw.wait_until < start || !raw.wait_at))
      errors.push(`main plan: they are in a later exit wave, so set wait_at (a safe place near them) and wait_until = "${start}".`);
  }
  if (profile.lang !== "en" && raw.text_localised.trim() === raw.action.trim()) errors.push(`text_localised must be written in language "${profile.lang}", not English.`);

  // Human-only zones: never let the AI resolve these on its own.
  const heat = parts.some((p) => p.type === "HEAT");
  let needs_human = raw.needs_human;
  let needs_human_reason = raw.needs_human_reason;
  if (profile.medical_flag && (heat || parts.some((p) => p.type === "STORM"))) {
    needs_human = true;
    needs_human_reason = needs_human_reason ?? `Medical condition on file (${profile.medical_flag}) — staff to check in.`;
  }
  if (!assigned) {
    needs_human = true;
    needs_human_reason = needs_human_reason ?? "No gate or seat capacity left for them in this scenario: staff to assist (see pre-mortem).";
  }
  if (errors.length || !main) return { errors };

  const fix = (s: z.infer<z.ZodObject<typeof Step>>, o: Option): PlanStep => ({
    ...s,
    transport: o.transport, // canonical names/platform from data, never model text
    notify_contact: o.zone_change, // deterministic: zone moved → contact must be told
    arrive: o.arrive,
  });
  return {
    errors: [],
    plan: {
      person_id: profile.id,
      scenario,
      ...fix(raw, main),
      source: sourceFor(scenario),
      lang: profile.lang,
      alternatives: alts.map(({ a, o }) => fix(a, o!)),
      escalate_text_localised: raw.escalate_text_localised,
      confidence: raw.confidence,
      needs_human,
      needs_human_reason,
      generated_by: model,
    },
  };
}

/** Used only when Claude can't produce a valid plan after retries. English, rule-ranked, clearly labelled. */
export function rulesFallbackPlan(profile: Profile, scenario: string): Plan | null {
  const assigned = assignmentFor(profile, scenario);
  const base = assigned ? assigned.options : feasibleOptions(profile, scenario);
  const options = assigned ? [assigned.option, ...base.filter((o) => o !== assigned.option && !(o.gate_id === assigned.option.gate_id && o.transport.ref_id === assigned.option.transport.ref_id && o.transport.depart === assigned.option.transport.depart))] : base;
  if (!options.length) return null;
  const toStep = (o: Option): PlanStep => ({
    action: `Leave via ${o.gate_id.replace("gate_", "Gate ")}`,
    gate_id: o.gate_id,
    route_id: o.route_id,
    transport: o.transport,
    group_meetup: null,
    wait_at: null,
    wait_until: null,
    volunteer_escort: profile.access.wheelchair,
    reason: o.facts.join("; "),
    text_localised: `Leave via ${o.gate_id.replace("gate_", "Gate ")}`,
    reason_localised: o.facts[o.facts.length - 1],
    notify_contact: o.zone_change,
    arrive: o.arrive,
  });
  return {
    person_id: profile.id,
    scenario,
    ...toStep(options[0]),
    source: sourceFor(scenario),
    lang: profile.lang,
    alternatives: options.slice(1, 4).map(toStep),
    escalate_text_localised: "Go to the nearest info tent or show this screen to any volunteer.",
    confidence: "low",
    needs_human: !!profile.medical_flag,
    needs_human_reason: profile.medical_flag ? `Medical condition on file (${profile.medical_flag})` : null,
    generated_by: "rules_fallback",
  };
}
