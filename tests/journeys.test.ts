import assert from "node:assert/strict";
import test from "node:test";
import { site, transport, type Profile } from "../lib/data";
import { buildJourneyOptions, type JourneySettings } from "../lib/journeys";
import { festivalInstant } from "../lib/festival-time";

const attendee: Profile = {
  id: "journey_test", name: "Journey test", age: 25, lang: "en", home: { mode: "train", line: "Sandringham" },
  access: { wheelchair: false, step_free: false, low_vision: false, sensory: false },
  under_18: false, first_timer: false, medical_flag: null, group: null,
  location_at_end: "lawn_stage", must_see: [], weight: 1, walking_pace_multiplier: 1,
};
const settings: JourneySettings = { festival_date: "2026-10-08", timezone: "Australia/Melbourne", now: new Date("2026-10-08T11:00:00Z") };

test("candidates enumerate later departures rather than only the first train", () => {
  const result = buildJourneyOptions(attendee, "NORMAL", settings);
  // Trains only: Gate C also leads to the coach bays, whose shuttles carry confirmed seats.
  const openPath = result.options.filter((option) => option.route_id === "route_C_open" && option.transport.mode === "train");
  assert.ok(openPath.some((option) => option.depart_at === "22:47"));
  assert.ok(openPath.some((option) => option.depart_at === "23:07"));
  assert.ok(openPath.every((option) => option.capacity.status === "unknown"));
  assert.ok(openPath.every((option) => option.missing_information.some((value) => value.includes("unreserved"))));
  assert.ok(!("score" in openPath[0]));
});

test("a covered detour cannot be recommended for a boarding deadline it misses", () => {
  const result = buildJourneyOptions(attendee, "NORMAL", { ...settings, latest_arrival: "22:44" });
  assert.ok(result.options.some((option) => option.route_id === "route_C_open" && option.depart_at === "22:47"));
  assert.ok(result.options.every((option) => option.route_id !== "covered_path_2"));
  assert.ok(result.options.every((option) => option.arrive <= "22:44"));
});

test("walking pace changes both segments and timely boarding eligibility", () => {
  const result = buildJourneyOptions({ ...attendee, walking_pace_multiplier: 1.5 }, "NORMAL", { ...settings, latest_arrival: "22:44" });
  assert.equal(result.options.length, 0);
  const later = buildJourneyOptions({ ...attendee, walking_pace_multiplier: 1.5 }, "NORMAL", settings);
  const option = later.options.find((item) => item.route_id === "route_C_open")!;
  assert.deepEqual(option.segments.map((segment) => segment.walk_minutes), [12, 9]);
  assert.equal(option.arrive, "22:51");
  assert.notEqual(option.depart_at, "22:47");
});

test("confirmed gate closures exclude every path through that gate", () => {
  const result = buildJourneyOptions(attendee, "GATE_C", settings);
  assert.ok(result.options.length);
  assert.ok(result.options.every((option) => option.gate_id !== "gate_C"));
});

test("weather does not impose closures; only the approved storm scenario excludes exposed segments", () => {
  const normal = buildJourneyOptions(attendee, "NORMAL", { ...settings, ready_at: "22:20" });
  assert.ok(normal.options.some((option) => option.segments.some((segment) => segment.covered === false)));
  const storm = buildJourneyOptions(attendee, "STORM", { ...settings, ready_at: "22:20" });
  assert.ok(storm.options.length);
  assert.ok(storm.options.every((option) => option.segments.every((segment) => segment.covered === true)));
  assert.ok(storm.procedures.some((procedure) => procedure.includes("MOCK")));
});

test("public train seat requirements cannot be satisfied by unknown boarding capacity", () => {
  const railOnly = { ...transport, shuttles: [], taxis: [] };
  const result = buildJourneyOptions({ ...attendee, preferences: { seat_required: true } }, "NORMAL", { ...settings, transport: railOnly });
  assert.equal(result.options.length, 0);
  assert.ok(result.missing_information.some((value) => value.includes("required seat")));
});

test("nominal service capacity is not accepted as confirmed remaining seats", () => {
  const person: Profile = { ...attendee, location_at_end: "accessible_platform", home: { mode: "shuttle", booking: "shuttle_acc_2320" }, access: { ...attendee.access, wheelchair: true, step_free: true } };
  // Strip any confirmations from the live data so this tests the rule, not the current data file.
  const unconfirmed = structuredClone(transport);
  for (const service of [...unconfirmed.shuttles, ...unconfirmed.taxis]) {
    delete service.confirmed_remaining; delete service.capacity_confirmed_at; delete service.capacity_valid_until;
  }
  const missing = buildJourneyOptions(person, "NORMAL", { ...settings, transport: unconfirmed });
  assert.equal(missing.options.length, 0);
  assert.ok(missing.missing_information.some((value) => value.includes("nominal capacity")));
  const available = structuredClone(unconfirmed);
  Object.assign(available.shuttles.find((service) => service.id === "shuttle_acc_2320")!, { confirmed_remaining: 1, capacity_confirmed_at: "2026-10-08T10:58:00Z" });
  const confirmed = buildJourneyOptions(person, "NORMAL", { ...settings, transport: available });
  assert.ok(confirmed.options.length);
  assert.ok(confirmed.options.every((option) => option.route_id === "ramp_path_D" && option.capacity.available === 1));
  const stale = buildJourneyOptions(person, "NORMAL", { ...settings, now: new Date("2026-10-08T12:00:00Z"), transport: available });
  assert.equal(stale.options.length, 0);
});

test("a full service and insufficient seats for the group are excluded", () => {
  const available = structuredClone(transport);
  for (const service of available.shuttles) Object.assign(service, { confirmed_remaining: 1, capacity_confirmed_at: "2026-10-08T10:58:00Z" });
  const person: Profile = { ...attendee, home: { mode: "shuttle", booking: "shuttle_gen_2250" }, group: { id: "test_group", size: 2 } };
  const result = buildJourneyOptions(person, "NORMAL", { ...settings, transport: available });
  assert.equal(result.options.length, 0);
  assert.ok(result.missing_information.some((value) => value.includes("insufficient")));
});

test("unknown shelter remains null, and unapproved locations cannot become sheltered waiting choices", () => {
  const result = buildJourneyOptions(attendee, "NORMAL", settings);
  assert.ok(result.options.every((option) => option.wait_at === null));
  assert.ok(result.options.some((option) => option.waiting_periods.some((period) => period.place_id === "flinders_st" && period.covered === null)));
  const graph = structuredClone(site);
  Object.assign(graph.places.find((place) => place.id === attendee.location_at_end)!, { approved_waiting: true, covered: true, step_free: true });
  const approved = buildJourneyOptions(attendee, "NORMAL", { ...settings, site: graph });
  const delayed = approved.options.find((option) => option.wait_at === attendee.location_at_end)!;
  assert.ok(delayed);
  assert.equal(delayed.wait_until, delayed.leave_at);
  assert.equal(delayed.waiting_periods[0].covered, true);
  assert.ok(delayed.arrive <= delayed.boarding_deadline!);
});

test("forecast windows include walking, waiting and boarding until the actual departure", () => {
  const result = buildJourneyOptions(attendee, "NORMAL", settings);
  const option = result.options.find((item) => item.route_id === "route_C_open" && item.depart_at === "22:47")!;
  assert.equal(option.segments[0].start, "2026-10-08T11:30:00.000Z");
  assert.equal(option.segments[1].end, "2026-10-08T11:44:00.000Z");
  assert.equal(option.waiting_periods[0].end, "2026-10-08T11:47:00.000Z");
});

test("missing festival date produces no invented date or current-weather interval", () => {
  const result = buildJourneyOptions(attendee, "NORMAL", { ...settings, festival_date: null });
  assert.equal(result.festival_date, null);
  assert.deepEqual(result.window, { start: null, end: null });
  assert.ok(result.options.every((option) => option.segments.every((segment) => segment.start === null && segment.end === null)));
  assert.ok(result.missing_information.some((value) => value.includes("weather is unavailable")));
});

test("festival timezone conversion handles after-midnight schedules and invalid local times", () => {
  assert.equal(festivalInstant("2026-10-08", 24 * 60 + 7, "Australia/Melbourne"), "2026-10-08T13:07:00.000Z");
  assert.equal(festivalInstant("2026-06-01", 22 * 60 + 30, "Australia/Melbourne"), "2026-06-01T12:30:00.000Z");
  assert.equal(festivalInstant("2026-02-30", 12 * 60, "Australia/Melbourne"), null);
  assert.equal(festivalInstant("2026-10-04", 2 * 60 + 30, "Australia/Melbourne"), null);
  assert.equal(festivalInstant("2026-10-08", 10, "not-a-timezone"), null);
});

test("confirmed set delay preserves the existing later ready time", () => {
  const result = buildJourneyOptions({ ...attendee, location_at_end: "river_stage" }, "SET_RIVER_30", settings);
  assert.ok(result.options.length);
  assert.ok(result.options.every((option) => option.leave_at === "23:00"));
});
