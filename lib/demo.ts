// Demo notifications for the recorded hackathon demo. Nothing here is detected live or sent for real:
// an organizer picks an attendee and a scenario, and the notification is generated from that attendee's
// saved profile, plan, must-see artists and contact. Phones pick it up through the same 2-second polling
// they already use for Plan B triggers (works across devices, unlike browser-only BroadcastChannel).
import fs from "node:fs";
import path from "node:path";
import { loadProfiles, nameOf, placeById, timetable, toMin, toTime, type Profile } from "./data";
import { readBroadcast } from "./state";
import { planFor } from "./preview";
import { resetCrowd, setCrowdLevel } from "./crowd";
import { clearLivePlans } from "./replan";

const STATE_PATH = path.join(process.cwd(), "data", "state", "demo.json");
export const DELIVERY_DELAY_MS = 2000; // the "it arrives a moment later" beat for the recording
const DEMO_DAY = "Sat"; // the demo night
const SET_DELAY_MIN = 20;

export type Scenario = "congestion" | "delay" | "pickup" | "priority";
export type DemoNote = {
  id: string;
  person_id: string;
  audience: "attendee" | "contact";
  scenario: Scenario;
  title: string;
  body: string;
  created_at: number; // ms since epoch, server clock
  // What tapping the notification opens.
  action: { kind: "route" } | { kind: "lineup"; set_id: string } | { kind: "pickup"; place: string };
  to?: string; // contact notes: "Sarah (Parent, +61 ••• ••• 123)"
};
type DemoState = { seq: number; notes: DemoNote[]; set_delays: Record<string, number> };

const empty = (): DemoState => ({ seq: 0, notes: [], set_delays: {} });
function read(): DemoState {
  try {
    return fs.existsSync(STATE_PATH) ? { ...empty(), ...JSON.parse(fs.readFileSync(STATE_PATH, "utf8")) } : empty();
  } catch {
    return empty();
  }
}
function write(s: DemoState) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
}

const short = (id: string) => nameOf(id).replace(/ \(.*/, "");
const stageName = (id: string) => timetable.stages.find((s) => s.id === id)?.name ?? short(id);
const firstName = (n: string) => n.trim().split(/\s+/)[0];

/** The attendee's sets for the demo night: their must-see list. */
export function lineupFor(p: Profile, delays: Record<string, number> = {}) {
  return timetable.sets
    .filter((s) => s.day === DEMO_DAY && p.must_see.includes(s.id))
    .map((s) => {
      const d = delays[s.id] ?? 0;
      return { id: s.id, artist: s.artist, stage_id: s.stage_id, stage: stageName(s.stage_id), start: toTime(toMin(s.start) + d), end: toTime(toMin(s.end) + d), was_start: d ? s.start : null, delay_min: d };
    });
}

// "Your next performance": their first must-see, otherwise the headliner at the stage they'll be at.
function nextSet(p: Profile) {
  const mine = timetable.sets.find((s) => s.day === DEMO_DAY && p.must_see.includes(s.id));
  const atStage = timetable.sets.filter((s) => s.day === DEMO_DAY && s.stage_id === p.location_at_end);
  return mine ?? atStage[atStage.length - 1] ?? null; // otherwise the last set at the stage they'll be at
}

function currentPlan(p: Profile) {
  return planFor(p.id, readBroadcast()?.code ?? "NORMAL").plan;
}

// Where the contact should go: their pickup point, otherwise the gate on their current plan.
function pickupPlace(p: Profile): string | null {
  const plan = currentPlan(p);
  if (plan?.transport.mode === "pickup") return short(plan.transport.ref_id);
  if (p.home.mode === "pickup") return short(p.home.zone);
  return plan ? `Gate ${plan.gate_id.replace("gate_", "")}` : null;
}

/** Which scenarios can run for this attendee, and why not when they can't. */
export function availability(p: Profile): Record<Scenario, string | null> {
  const plan = currentPlan(p);
  return {
    congestion: plan ? null : "No saved plan for this attendee yet.",
    delay: nextSet(p) ? null : "No set to delay for this attendee.",
    priority: p.must_see.length && timetable.sets.some((s) => s.day === DEMO_DAY && p.must_see.includes(s.id)) ? null : "No must-see artist saved for this attendee.",
    pickup: !p.contact
      ? "No emergency/pickup contact saved. Add one on their Details page."
      : !p.contact.attendee_agreed
        ? "The attendee didn't agree to this contact receiving updates."
        : pickupPlace(p) ? null : "No pickup point or plan for this attendee yet.",
  };
}

/** Attendees shown in Demo Controls: the sample heroes and anyone who went through ticket checkout. */
export function candidates() {
  return loadProfiles()
    .filter((p) => p.hero || p.checkout)
    .map((p) => ({
      id: p.id,
      name: p.name,
      contact: p.contact ? { name: p.contact.name, relationship: p.contact.relationship, phone_masked: p.contact.phone_masked, attendee_agreed: p.contact.attendee_agreed } : null,
      must_see: lineupFor(p, read().set_delays).map((s) => `${s.artist} · ${s.stage} ${s.start}`),
      unavailable: availability(p),
    }));
}

export function trigger(personId: string, scenario: Scenario): DemoNote | { error: string } {
  const p = loadProfiles().find((x) => x.id === personId);
  if (!p) return { error: "Unknown attendee" };
  const why = availability(p)[scenario];
  if (why) return { error: why };
  const s = read();
  const base = { id: `n${s.seq + 1}-${Date.now()}`, person_id: p.id, scenario, created_at: Date.now() };
  let note: DemoNote;

  if (scenario === "congestion") {
    // Simulated input: mark the path on their current plan as heavy. The real crowd layer then re-ranks
    // their saved options on the phone (and the server's routing), exactly as a staff report would.
    const plan = currentPlan(p)!;
    setCrowdLevel(plan.route_id, "heavy");
    const canSwitch = plan.alternatives.some((a) => a.route_id !== plan.route_id);
    const near = placeById(p.location_at_end)?.name.replace(/ \(.*/, "") ?? "your stage";
    note = {
      ...base, audience: "attendee", title: "Crowd update",
      body: canSwitch
        ? `Heavy congestion reported near ${near}. We've updated your route to avoid the crowd. Tap to view.`
        : `Heavy congestion reported near ${near}. There's no quieter path for you, so allow extra time. Tap to view.`,
      action: { kind: "route" },
    };
  } else if (scenario === "delay") {
    const set = nextSet(p)!;
    s.set_delays[set.id] = SET_DELAY_MIN; // same result every time it's triggered
    note = {
      ...base, audience: "attendee", title: "Schedule change",
      body: `Your next performance, ${set.artist} at ${stageName(set.stage_id)}, has been delayed by ${SET_DELAY_MIN} minutes (now ${toTime(toMin(set.start) + SET_DELAY_MIN)}). Your itinerary has been adjusted.`,
      action: { kind: "lineup", set_id: set.id },
    };
  } else if (scenario === "priority") {
    const set = timetable.sets.find((x) => x.day === DEMO_DAY && p.must_see.includes(x.id))!;
    note = {
      ...base, audience: "attendee", title: "Your priority artist",
      body: `${set.artist} starts in 15 minutes! Leave now to reach ${stageName(set.stage_id)} on time.`,
      action: { kind: "lineup", set_id: set.id },
    };
  } else {
    const c = p.contact!;
    const place = pickupPlace(p)!;
    note = {
      ...base, audience: "contact", title: "Fieldday",
      body: `Hi ${firstName(c.name)}, ${p.name} is ready for pickup at ${place}. Please proceed to the designated pickup area.`,
      action: { kind: "pickup", place },
      to: `${c.name} (${c.relationship}, ${c.phone_masked})`,
    };
  }
  write({ ...s, seq: s.seq + 1, notes: [...s.notes, note] });
  return note;
}

/** Notifications that have "arrived" (2 s after the trigger) for one attendee's phone or their contact's phone. */
export function inbox(personId: string, audience: "attendee" | "contact") {
  const s = read();
  const now = Date.now();
  return {
    notes: s.notes.filter((n) => n.person_id === personId && n.audience === audience && n.created_at + DELIVERY_DELAY_MS <= now),
    set_delays: s.set_delays,
  };
}

export function recent() {
  return read().notes.slice(-8).reverse();
}

export function resetDemo() {
  write(empty());
  resetCrowd(); // the congestion scenario marks a path heavy
  clearLivePlans(); // so the live-replan demo can run again
}
