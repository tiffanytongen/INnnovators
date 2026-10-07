// Organizer "Weather check": fetch the live forecast, ask Claude to re-rank each attendee's journey
// for it (within their crowd-allocated gate and wave), and turn real changes into proposals that
// a named organizer must approve. Nothing reaches a phone without that approval.
import fs from "node:fs";
import path from "node:path";
import { loadProfiles, toTime, type Profile } from "./data";
import { assignmentFor } from "./allocate";
import { leaveTime, worldFor } from "./options";
import { parseScenario, canonicalCode } from "./scenario";
import { readPlanFile } from "./generate";
import { planJourney, preparePlanning } from "./weather-planner";
import { proposePlan } from "./plan-revisions";
import type { Forecast } from "./weather-types";

export type WeatherCheckResult = {
  person_id: string;
  name: string;
  outcome: "proposed" | "unchanged" | "staff_review" | "error";
  detail: string;
};

/** The situation currently live on phones (last approved broadcast), else a normal night. */
export function activeScenario(): string {
  const p = path.join(process.cwd(), "data", "state", "broadcast.json");
  const code = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")).code : "NORMAL";
  return canonicalCode(code ?? "NORMAL") ?? "NORMAL";
}

function settingsFor(profile: Profile, scenario: string) {
  const assigned = assignmentFor(profile, scenario);
  const start = leaveTime(profile, worldFor(parseScenario(scenario) ?? [])) + (assigned?.delay ?? 0);
  return { assigned, settings: { ready_at: toTime(start) }, allowedGate: assigned?.option.gate_id };
}

/** Forecast for the exit window of the given situation (uses the first hero's journey window). */
export async function exitForecast(scenario: string): Promise<Forecast> {
  const hero = loadProfiles().find((p) => p.hero)!;
  const { settings, allowedGate } = settingsFor(hero, scenario);
  const input = await preparePlanning(hero, scenario, { settings, allowedGate });
  return input.forecast;
}

export async function runWeatherCheck(scenario = activeScenario(), people = loadProfiles().filter((p) => p.hero)) {
  const results: WeatherCheckResult[] = [];
  let forecast: Forecast | null = null;
  for (const profile of people) {
    try {
      const { settings, allowedGate } = settingsFor(profile, scenario);
      const result = await planJourney(profile, scenario, { settings, allowedGate });
      forecast ??= result.forecast;
      if (!result.plan) {
        results.push({ person_id: profile.id, name: profile.name, outcome: "staff_review", detail: result.reason ?? "Staff review needed." });
        continue;
      }
      // The weather planner doesn't choose meet-up points or escorts; keep the approved plan's ones when the gate is unchanged.
      const current = readPlanFile(profile.id)?.plans[scenario];
      const plan = { ...result.plan };
      if (current && current.gate_id === plan.gate_id) {
        plan.group_meetup = current.group_meetup;
        plan.volunteer_escort = current.volunteer_escort;
      }
      // Plans written before the weather planner have no journey timing; same route/gate/transport/wait = no change.
      const sameDecision = current && !current.journey &&
        current.gate_id === plan.gate_id && current.route_id === plan.route_id &&
        current.transport.ref_id === plan.transport.ref_id && current.transport.depart === plan.transport.depart &&
        current.wait_at === plan.wait_at && current.wait_until === plan.wait_until;
      if (sameDecision) {
        results.push({ person_id: profile.id, name: profile.name, outcome: "unchanged", detail: "Current plan is still the best for this forecast." });
        continue;
      }
      const { status, proposal } = proposePlan(plan, { forecast_fingerprint: result.input_fingerprint });
      results.push({
        person_id: profile.id,
        name: profile.name,
        outcome: status === "pending" ? "proposed" : "unchanged",
        detail: status === "pending" ? (proposal?.change_summary.join("; ") ?? "") : "Current plan is still the best for this forecast.",
      });
    } catch (e) {
      results.push({ person_id: profile.id, name: profile.name, outcome: "error", detail: e instanceof Error ? e.message : String(e) });
    }
  }
  return { scenario, forecast, results };
}
