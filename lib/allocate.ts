// Crowd allocation: hands out gate places (per 30-minute wave) and limited seats (shuttles, accessible taxis)
// across EVERY attendee at once, so no gate is told to take more people than it can move.
// People with the fewest options choose first; existing bookings/pickup points are kept where possible;
// when a gate is full people get their next-best gate, or a later wave ("leave at 23:00").
// Deterministic. Claude then writes each person's plan around the option they were given.
import { loadProfiles, site, transport, nameOf, toTime, type Profile, type Service } from "./data";
import { feasibleOptions, leaveTime, worldFor, type Option } from "./options";
import { parseScenario } from "./scenario";

export const WAVE_MIN = 30;
export const WAVES = 4; // leave now, +30, +60, +90 min

export type Chunk = { option: Option; delay: number; people: number };
export type Allocation = {
  scenario: string;
  byPerson: Record<string, Chunk[]>; // first chunk = what a single person (or most of a cohort) is told
  stuck: { p: Profile; people: number; reason: string }[];
  gateLoad: Record<string, number[]>; // people per gate per wave
  gateCap: Record<string, number>; // places per gate per wave
  waited: number; // people asked to leave in a later wave
};

const committedOf = (p: Profile) => (p.home.mode === "shuttle" ? p.home.booking : p.home.mode === "pickup" ? p.home.zone : null);

export function allocate(scenario: string, profiles: Profile[] = loadProfiles(), extra: Service[] = []): Allocation {
  const gateCap = Object.fromEntries(site.gates.map((g) => [g.id, Math.floor((g.capacity_per_hour * WAVE_MIN) / 60)]));
  const gateLeft = Object.fromEntries(site.gates.map((g) => [g.id, Array(WAVES).fill(gateCap[g.id])])) as Record<string, number[]>;
  const seatsLeft = new Map([...transport.shuttles, ...transport.taxis, ...extra].map((s) => [s.id, s.capacity]));

  const rows = profiles.map((p) => ({ p, waves: Array.from({ length: WAVES }, (_, k) => feasibleOptions(p, scenario, extra, k * WAVE_MIN)) }));
  const committed = (r: (typeof rows)[number]) => {
    const c = committedOf(r.p);
    return !!c && r.waves[0].some((o) => o.transport.ref_id === c);
  };
  // Who chooses first: people who need step-free routes (they can only use the accessible gate), then existing
  // bookings / pickup points, then the most constrained (fewest ways home), then everyone else.
  const stepFree = (p: Profile) => p.access.step_free || p.access.wheelchair;
  rows.sort((a, b) => Number(stepFree(b.p)) - Number(stepFree(a.p)) || Number(committed(b)) - Number(committed(a)) || a.waves[0].length - b.waves[0].length || Number(!!b.p.hero) - Number(!!a.p.hero));

  const byPerson: Allocation["byPerson"] = {};
  const stuck: Allocation["stuck"] = [];
  for (const r of rows) {
    let remaining = r.p.weight;
    const chunks: Chunk[] = [];
    const take = (o: Option, k: number) => {
      const seat = seatsLeft.get(o.transport.ref_id);
      const room = Math.min(gateLeft[o.gate_id][k], seat ?? Infinity, remaining);
      if (room <= 0) return;
      gateLeft[o.gate_id][k] -= room;
      if (seat !== undefined) seatsLeft.set(o.transport.ref_id, seat - room);
      remaining -= room;
      chunks.push({ option: o, delay: k * WAVE_MIN, people: room });
    };
    const c = committedOf(r.p);
    // Pass 1: keep their booking / pickup point (any wave). Pass 2: anything else, best first, earliest wave first.
    if (c) for (let k = 0; k < WAVES && remaining; k++) for (const o of r.waves[k]) if (remaining && o.transport.ref_id === c) take(o, k);
    for (let k = 0; k < WAVES && remaining; k++) for (const o of r.waves[k]) if (remaining) take(o, k);

    if (chunks.length) byPerson[r.p.id] = chunks;
    if (remaining) {
      const all = r.waves.flat();
      const reason =
        all.length === 0
          ? r.p.access.step_free || r.p.access.wheelchair
            ? "No open, step-free (and covered, if storming) route reaches their way home"
            : "No open route gets them home in time"
          : all.every((o) => seatsLeft.has(o.transport.ref_id))
            ? `Every way home they can use is full: ${[...new Set(all.map((o) => nameOf(o.transport.ref_id)))].join(", ")}`
            : `Every gate they can use is full until ${toTime(leaveTime(r.p, worldFor(parseScenario(scenario) ?? [])) + WAVES * WAVE_MIN)}`;
      stuck.push({ p: r.p, people: remaining, reason });
    }
  }

  const gateLoad = Object.fromEntries(site.gates.map((g) => [g.id, gateLeft[g.id].map((left) => gateCap[g.id] - left)]));
  const waited = Object.values(byPerson).flat().filter((ch) => ch.delay > 0).reduce((n, ch) => n + ch.people, 0);
  return { scenario, byPerson, stuck, gateLoad, gateCap, waited };
}

/** What one person is told: their first chunk, with the full option list for that wave. */
export function assignmentFor(p: Profile, scenario: string, alloc = allocate(scenario)) {
  const first = alloc.byPerson[p.id]?.[0];
  if (!first) return null;
  return { option: first.option, delay: first.delay, options: feasibleOptions(p, scenario, [], first.delay) };
}
