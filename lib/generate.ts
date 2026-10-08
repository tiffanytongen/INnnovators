// Generate one person's plan for one scenario with Claude, validate, retry with the errors, else fall back to rules.
import fs from "node:fs";
import path from "node:path";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { claude, MODEL, FALLBACK_OPTS } from "./claude";
import { site, transport, scenarios, nameOf, textsContact, type Profile } from "./data";
import { feasibleOptions, worldFor, closedPlaces, leaveTime } from "./options";
import { assignmentFor } from "./allocate";
import { parseScenario, describePart } from "./scenario";
import { ClaudePlanSchema, validatePlan, rulesFallbackPlan, type Plan } from "./plan";
import { toTime } from "./data";

const LANG_NAMES: Record<string, string> = { en: "English", zh: "Simplified Chinese (Mandarin)", vi: "Vietnamese", ar: "Arabic", hi: "Hindi", es: "Spanish", ko: "Korean", it: "Italian", el: "Greek" };

// Stable system prompt (cache-friendly): rules + the site and transport data.
const SYSTEM = `You write personal exit plans for attendees of Fieldday, a riverfront music festival in Melbourne. Each plan tells ONE person their ONE next step home, for one scenario (NORMAL = an ordinary night, "Plan A"; anything else is a disruption, "Plan B").

The person may be stressed, in the dark, on 8% battery, reading in their second language. Write for that.

How to decide:
- You receive a list of CANDIDATE options that a rules engine has already checked are physically possible (gate open, route allowed, step-free where needed, covered in a storm, a departure they can make). You MUST copy gate_id, route_id and transport exactly from one candidate. Never invent IDs, gates, platforms or times.
- Your job is the judgment the rules can't make: weigh the person's whole situation (access needs, age, group, language, first-timer, booking, the storm's timing, waiting outside vs. leaving now, crowding at a gate) and choose and rank the options. When constraints conflict, say what you traded off in "reason" (e.g. "Taxi now instead of waiting for the 23:20 shuttle so you're inside before the storm").
- Keep existing arrangements: if their booked shuttle or pickup zone is still among the candidates, the main plan MUST use it (a parent is waiting there; a seat is held). Only move them when the scenario makes it impossible, and then say so plainly.
- group_meetup: if they have a group, choose a covered, open meetup point near their exit from the valid meetup points; else null.
- wait_at / wait_until: use when the right move is to stay somewhere safe and covered before moving, e.g. a wheelchair user waiting on the covered accessible platform while the 15,000-person exit surge passes, then moving with a volunteer. wait_until must be no later than the candidate's latest_leave. Otherwise null. (Waiting at the destination for a pickup is not wait_at — that's just the destination.)
- volunteer_escort: true when a volunteer should meet them (wheelchair users in a disruption, a minor whose pickup changed, etc.).
- needs_human: true ONLY for a medical condition, a lost/missing child, or a safety threat. Those are never AI-resolved; still give the safest candidate, but flag it. A minor whose pickup point moved is NOT needs_human — use volunteer_escort instead.
- If a candidate says PICKUP_ZONE_CHANGES, the person's contact is messaged automatically by Fieldday — tell them that ("your parent has been sent the new pickup point"); don't ask them to do it. If it also says CONTACT_NOT_OPTED_IN, nobody is texted: ask them to tell their contact the new pickup point.
- alternatives: 1-3 OTHER candidates, best first, each with its own reason. These are shown offline when the person taps "Doesn't work for me".

Writing:
- action: one short imperative sentence in English, e.g. "Leave now via Gate C, covered path".
- text_localised / reason_localised: the same in the person's language, calm and short (max ~25 words each). Gate letters, platform numbers and times are shown separately as fixed fields, so you may mention them, but only times that appear in the candidates, their booking or the scenario, written as HH:MM. The same applies to "reason".
- escalate_text_localised: in their language, "Go to the nearest info tent or show this screen to any volunteer."

SITE DATA:
${JSON.stringify({ gates: site.gates, routes: site.routes, places: site.places, meetup_points: site.meetup_points })}

TRANSPORT (timetabled, before any delay):
${JSON.stringify(transport)}`;

export function userPrompt(profile: Profile, scenario: string) {
  const parts = parseScenario(scenario)!;
  const w = worldFor(parts);
  // Crowd allocation across ALL attendees decides which gate/wave this person gets (no gate over capacity).
  const assigned = assignmentFor(profile, scenario);
  const options = assigned ? assigned.options : feasibleOptions(profile, parts);
  const start = leaveTime(profile, w) + (assigned?.delay ?? 0);
  const effects = parts.flatMap((p) => {
    const t = scenarios.types.find((s) => s.type === p.type)!;
    return [`${describePart(p)} [${t.emp_section}]: ${t.effects.join("; ")}`];
  });
  const isAssigned = (o: (typeof options)[number]) => !!assigned && o.gate_id === assigned.option.gate_id && o.route_id === assigned.option.route_id && o.transport.ref_id === assigned.option.transport.ref_id && o.transport.depart === assigned.option.transport.depart;
  const crowd = assigned
    ? `CROWD ALLOCATION (decided across all ~15,000 attendees so no gate goes over capacity; you must follow it):
- Main plan MUST be the option marked ASSIGNED below.
- ${assigned.delay > 0 ? `They are in a later exit wave: they should stay where they are (or somewhere covered, if storming) and start moving at ${toTime(start)}. Set wait_at to a safe, open place near them and wait_until to "${toTime(start)}". Explain kindly that this avoids the crush at the gates.` : `They leave in the first wave, at ${toTime(start)}.`}
- If the assigned gate isn't their closest, say briefly that the nearer gate is full.`
    : "CROWD ALLOCATION: no capacity left for this person in any wave. Give the safest option and set needs_human = true (staff will help).";
  return {
    options,
    assigned,
    text: `PERSON:
${JSON.stringify({ ...profile, weight: undefined, language_name: LANG_NAMES[profile.lang] ?? profile.lang }, null, 1)}

SCENARIO: ${scenario}
${effects.length ? effects.map((e) => `- ${e}`).join("\n") : "- Normal night. River Stage headliner ends 22:30 and ~15,000 people leave at once."}
Closed places: ${closedPlaces(w).map(nameOf).join(", ") || "none"}
Normal exit time from ${nameOf(profile.location_at_end)}: ${toTime(leaveTime(profile, w))}.

${crowd}

CANDIDATE OPTIONS (rules-checked, leaving at ${toTime(start)}):
${options.map((o, i) => `${i + 1}.${isAssigned(o) ? " [ASSIGNED]" : ""} gate_id=${o.gate_id} route_id=${o.route_id} transport=${JSON.stringify(o.transport)} arrive=${o.arrive} latest_leave=${o.latest_leave}${o.zone_change ? ` PICKUP_ZONE_CHANGES${textsContact(profile) ? "" : " CONTACT_NOT_OPTED_IN"}` : ""}${o.mode_change ? " MODE_CHANGE" : ""}\n   ${o.facts.join("\n   ")}`).join("\n")}

Write the plan for ${profile.name} in ${LANG_NAMES[profile.lang] ?? profile.lang}.`,
  };
}

export async function generatePlan(profile: Profile, scenario: string, log = console.log): Promise<Plan | null> {
  const { options, text } = userPrompt(profile, scenario);
  if (options.length === 0) {
    log(`  ${profile.id} ${scenario}: no feasible option (pre-mortem case)`);
    return null;
  }
  const messages: { role: "user" | "assistant"; content: string }[] = [{ role: "user", content: text }];
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await claude().beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      ...FALLBACK_OPTS,
      output_config: { effort: "medium", format: betaZodOutputFormat(ClaudePlanSchema) },
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages,
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) {
      log(`  ${profile.id} ${scenario}: attempt ${attempt} returned no plan (${res.stop_reason})`);
      continue;
    }
    const { plan, errors } = validatePlan(res.parsed_output, profile, scenario, res.model);
    if (plan) {
      log(`  ✓ ${profile.id} ${scenario} (attempt ${attempt}) → ${plan.gate_id} ${plan.transport.line} ${plan.transport.depart ?? ""}`);
      return plan;
    }
    log(`  ✗ ${profile.id} ${scenario} attempt ${attempt} rejected:\n    ${errors.join("\n    ")}`);
    messages.push(
      { role: "assistant", content: JSON.stringify(res.parsed_output) },
      { role: "user", content: `That plan was rejected by the validator:\n- ${errors.join("\n- ")}\nFix these and return the full plan again.` },
    );
  }
  log(`  ! ${profile.id} ${scenario}: using rules fallback`);
  return rulesFallbackPlan(profile, scenario);
}

export const PLANS_DIR = path.join(process.cwd(), "data", "plans");
export type PlanFile = { person_id: string; updated_at: string; plans: Record<string, Plan> };

export function readPlanFile(id: string): PlanFile | null {
  const p = path.join(PLANS_DIR, `${id}.json`);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
}

export function writePlan(plan: Plan) {
  fs.mkdirSync(PLANS_DIR, { recursive: true });
  const file = readPlanFile(plan.person_id) ?? { person_id: plan.person_id, updated_at: "", plans: {} };
  file.plans[plan.scenario] = plan;
  file.updated_at = new Date().toISOString();
  fs.writeFileSync(path.join(PLANS_DIR, `${plan.person_id}.json`), JSON.stringify(file, null, 2));
}
