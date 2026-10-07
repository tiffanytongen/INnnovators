// The rule layer: which exits are physically possible for a person in a scenario.
// Used three ways: (1) candidate list given to Claude, (2) validator for Claude's output,
// (3) pre-mortem feasibility counts. Claude decides between options; it never invents them.
import { site, transport, gateById, routeById, placeById, trainByLine, serviceById, toMin, toTime, type Profile, type Service } from "./data";
import { parseScenario, type ScenarioPart } from "./scenario";
import { readCrowd, crowdPenalty } from "./crowd";

export type Transport = { mode: "train" | "shuttle" | "taxi" | "pickup"; ref_id: string; line: string; platform: string; depart: string | null };

export type Option = {
  gate_id: string;
  route_id: string;
  transport: Transport;
  arrive: string; // when they reach the station / stop / zone
  latest_leave: string; // latest time they can start moving and still make it (= wait_until limit)
  facts: string[]; // short plain-English facts Claude can cite
  mode_change: boolean;
  zone_change: boolean;
  score: number; // lower = better (rule ranking, Claude may re-rank)
};

export type World = {
  storm: boolean;
  heat: boolean;
  closedGates: Set<string>;
  delays: Record<string, number>; // line_code -> mins
  fullServices: Set<string>;
  setDelays: Record<string, number>; // stage_id -> mins
  extraServices: Service[]; // pre-mortem fixes
};

const STAGE_IDS: Record<string, string> = { RIVER: "river_stage", LAWN: "lawn_stage", TENT: "tent_stage" };

export function worldFor(parts: ScenarioPart[], extraServices: Service[] = []): World {
  const w: World = { storm: false, heat: false, closedGates: new Set(), delays: {}, fullServices: new Set(), setDelays: {}, extraServices };
  for (const p of parts) {
    if (p.type === "STORM") w.storm = true;
    if (p.type === "HEAT") w.heat = true;
    if (p.type === "GATE_CLOSED") w.closedGates.add(`gate_${p.gate}`);
    if (p.type === "TRAIN_DELAY") w.delays[p.line_code] = p.mins;
    if (p.type === "SHUTTLE_FULL") w.fullServices.add("shuttle_acc_2245");
    if (p.type === "SET_DELAY") w.setDelays[STAGE_IDS[p.stage]] = p.mins;
  }
  return w;
}

/** Places that are closed or unusable in this world (for messaging + validation). */
export function closedPlaces(w: World): string[] {
  const closed: string[] = [];
  for (const pl of site.places) {
    if (!pl.via_gates) continue;
    if (pl.via_gates.every((g) => w.closedGates.has(g))) closed.push(pl.id);
    else if (w.storm && pl.type === "pickup_zone" && !pl.covered) closed.push(pl.id);
  }
  return closed;
}

export function leaveTime(p: Profile, w: World): number {
  const stage = p.location_at_end === "accessible_platform" ? "river_stage" : p.location_at_end;
  return toMin("22:30") + (w.setDelays[stage] ?? 0);
}

function serviceOptionsFor(p: Profile, w: World): Service[] {
  const all = [...transport.shuttles, ...transport.taxis, ...w.extraServices].filter((s) => !w.fullServices.has(s.id));
  if (p.access.step_free) return all.filter((s) => s.kind === "accessible" || s.kind === "accessible_taxi");
  return all.filter((s) => s.kind === "general");
}

/** Every physically possible way home for this person in this scenario, best first. */
export function feasibleOptions(p: Profile, scenario: string | ScenarioPart[], extraServices: Service[] = []): Option[] {
  const parts = typeof scenario === "string" ? parseScenario(scenario) : scenario;
  if (!parts) throw new Error(`Unknown scenario ${scenario}`);
  const w = worldFor(parts, extraServices);
  const closed = new Set(closedPlaces(w));
  const needStepFree = p.access.step_free || p.access.wheelchair;
  const from = p.location_at_end === "accessible_platform" ? ["accessible_platform", "river_stage"] : [p.location_at_end];
  const leave = leaveTime(p, w);
  const crowd = readCrowd();
  const out: Option[] = [];

  for (const route of site.routes) {
    if (!route.from.some((f) => from.includes(f))) continue;

    const crowdLevel = crowd[route.id]?.level ?? "low";
    if (crowdLevel === "closed") continue;

    const crowdCost = crowdPenalty(crowdLevel);

    const gate = gateById(route.gate_id)!;
    if (w.closedGates.has(gate.id)) continue;
    if (needStepFree && !(route.step_free && gate.step_free)) continue;
    if (w.storm && !route.covered) continue;
    const atGate = leave + route.walk_min;

    for (const conn of gate.connects_to) {
      if (needStepFree && !conn.step_free) continue;
      if (w.storm && !conn.covered) continue;
      if (closed.has(conn.id)) continue;
      const arrive = atGate + conn.walk_min;
      // Soft penalties: keep the accessible gate free for people who need it; prefer cover; tie-break on arrival.
      const soft = (!needStepFree && gate.priority_access ? 15 : 0) + (conn.covered ? 0 : 5) + (arrive - leave) / 100;
      const walk = arrive - leave;
      const base = { gate_id: gate.id, route_id: route.id, arrive: toTime(arrive) };
      const latestLeave = (depart: number, buffer: number) => toTime(Math.max(leave, depart - walk - buffer));
      const coverFacts = [
        `${route.name}: ${route.covered ? "covered" : "NOT covered"}, ${route.step_free ? "step-free" : "has steps"}, ${route.walk_min} min`,
        `Live crowd on ${route.name}: ${crowdLevel}${crowdCost ? ` (+${crowdCost} min crowd penalty)` : ""}`,
        `${gate.name} → ${placeById(conn.id)?.name}: ${conn.walk_min} min, ${conn.covered ? "covered" : "not covered"}${conn.note ? ` (${conn.note})` : ""}`
      ];

      // Train
      if (conn.id === "flinders_st" && p.home.mode === "train") {
        const train = trainByLine(p.home.line)!;
        const delay = w.delays[train.code] ?? 0;
        const dep = train.departures.map((d) => toMin(d) + delay).find((d) => d >= arrive + 3); // 3 min to reach the platform
        if (dep !== undefined) {
          out.push({
            ...base,
            latest_leave: latestLeave(dep, 3),
            transport: { mode: "train", ref_id: `train_${train.code}`, line: train.line, platform: String(train.platform), depart: toTime(dep) },
            facts: [...coverFacts, `${train.line} line platform ${train.platform}, next departure after arriving: ${toTime(dep)}${delay ? ` (includes +${delay} min delay)` : ""}`],
            mode_change: false, zone_change: false,
            score: dep - leave + crowdCost + (route.covered ? 0 : 10) + soft,
          });
        }
      }

      // Shuttles + accessible taxis (booked travellers, or train travellers who need a fallback)
      const stop = placeById(conn.id);
      if ((stop?.type === "shuttle_stop" || stop?.type === "taxi_rank") && p.home.mode !== "pickup") {
        for (const s of serviceOptionsFor(p, w)) {
          if (s.stop_id !== conn.id) continue;
          if (toMin(s.depart) < arrive) continue;
          const booked = p.home.mode === "shuttle" && p.home.booking === s.id;
          const modeChange = p.home.mode === "train";
          out.push({
            ...base,
            latest_leave: latestLeave(toMin(s.depart), 2),
            transport: { mode: s.kind === "accessible_taxi" ? "taxi" : "shuttle", ref_id: s.id, line: s.name, platform: s.stop_id, depart: s.depart },
            facts: [...coverFacts, `${s.name} from ${stop.name}, departs ${s.depart}, capacity ${s.capacity}${booked ? " (their existing booking)" : ""}`],
            mode_change: modeChange, zone_change: false,
            score: toMin(s.depart) - leave + crowdCost + (modeChange ? 30 : 0) + (p.home.mode === "shuttle" && !booked ? 10 : 0) + soft,
          });
        }
      }

      // Pickup
      if (stop?.type === "pickup_zone" && p.home.mode === "pickup") {
        if (needStepFree && !stop.step_free) continue;
        const zoneChange = p.home.zone !== stop.id;
        out.push({
          ...base,
          latest_leave: toTime(leave + 30), // pickup windows are long; don't hold people more than 30 min
          transport: { mode: "pickup", ref_id: stop.id, line: `${p.home.contact} pickup`, platform: stop.id, depart: null },
          facts: [...coverFacts, `${stop.name}: ${stop.covered ? "covered" : "not covered"}, ${stop.staffed ? "staffed" : "unstaffed"}${zoneChange ? ` — pickup point changes from ${placeById(p.home.zone)?.name}; their ${p.home.contact} must be told` : ""}`],
          mode_change: false, zone_change: zoneChange,
          score: arrive - leave + crowdCost + (zoneChange ? 20 : 0) + (stop.staffed ? 0 : 3) + soft,
        });
      }
    }
  }
  // De-duplicate identical gate+route+transport (two connections can lead to the same thing) and sort.
  const seen = new Set<string>();
  return out
    .sort((a, b) => a.score - b.score)
    .filter((o) => {
      const k = `${o.gate_id}|${o.route_id}|${o.transport.ref_id}|${o.transport.depart}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

export const validMeetups = () => site.meetup_points;
export const knownIds = () => new Set([...site.gates.map((g) => g.id), ...site.routes.map((r) => r.id), ...site.places.map((p) => p.id), ...transport.shuttles.map((s) => s.id), ...transport.taxis.map((s) => s.id)]);
export { routeById, serviceById };
