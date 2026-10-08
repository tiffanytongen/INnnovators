import assert from "node:assert/strict";
import test from "node:test";
import { type Profile } from "../lib/data";
import { feasibleOptions } from "../lib/options";
import { canonical, canonicalCode, parseScenario, pickCachedScenario } from "../lib/scenario";
import { summarize, validUnder } from "../lib/replan";
import type { Plan } from "../lib/plan";

const walker: Profile = {
  id: "replan_test", name: "Replan test", age: 25, lang: "en", home: { mode: "train", line: "Sandringham" },
  access: { wheelchair: false, step_free: false, low_vision: false, sensory: false },
  under_18: false, first_timer: false, medical_flag: null, group: null,
  location_at_end: "river_stage", must_see: [], weight: 1,
};
const pickup: Profile = { ...walker, id: "replan_pickup", home: { mode: "pickup", zone: "pickup_zone_1", contact: "parent" } };

test("new restriction types round-trip through scenario codes", () => {
  const parts = parseScenario("PLACE_pickup_zone_1+PATH_route_B_canopy");
  assert.deepEqual(parts, [{ type: "PLACE_CLOSED", place: "pickup_zone_1" }, { type: "PATH_CLOSED", route: "route_B_canopy" }]);
  assert.equal(canonical(parts!), "PATH_route_B_canopy+PLACE_pickup_zone_1");
  assert.equal(canonicalCode("PATH_not_a_path"), null, "unknown ids are rejected");
});

test("a new restriction never silently matches a pre-made plan that doesn't cover it", () => {
  const r = pickCachedScenario("PATH_route_B_canopy", ["NORMAL", "STORM", "GATE_A"]);
  assert.deepEqual(r, { key: "NORMAL", exact: false });
});

test("closed paths and places are removed from the rules-checked options", () => {
  assert.ok(feasibleOptions(walker, "NORMAL").some((o) => o.route_id === "route_B_canopy"));
  assert.ok(!feasibleOptions(walker, "PATH_route_B_canopy").some((o) => o.route_id === "route_B_canopy"));
  assert.ok(feasibleOptions(pickup, "NORMAL").some((o) => o.transport.ref_id === "pickup_zone_1"));
  assert.ok(!feasibleOptions(pickup, "PLACE_pickup_zone_1").some((o) => o.transport.ref_id === "pickup_zone_1"));
});

test("validUnder rejects a plan that uses a closed path, and accepts one that doesn't", () => {
  const opt = feasibleOptions(walker, "NORMAL").find((o) => o.route_id === "route_B_canopy")!;
  const plan = { gate_id: opt.gate_id, route_id: opt.route_id, transport: opt.transport, wait_at: null } as unknown as Plan;
  assert.equal(validUnder(plan, walker, "NORMAL").ok, true);
  const closed = validUnder(plan, walker, "PATH_route_B_canopy");
  assert.equal(closed.ok, false);
  assert.match(closed.why, /closed/);
  assert.match(summarize(plan), /^Gate B via /);
});
