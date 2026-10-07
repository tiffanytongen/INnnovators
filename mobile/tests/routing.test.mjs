import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBundle, crowdAwarePlan, supportedZones, resolveZone, displayTime } from "../src/participant-model.ts";
import { normalizeCrowd } from "../../lib/crowd-model.ts";

const plan = {
  action: "Leave via Gate A", gate_id: "gate_A", route_id: "a",
  transport: { mode: "train", ref_id: "train", line: "Train", platform: "1", depart: "23:00" },
  group_meetup: null, wait_at: null, wait_until: null, volunteer_escort: false, notify_contact: false,
  reason: "Route A", text_localised: "Route A", reason_localised: "Route A", source: "Ops",
  alternatives: [], needs_human: false, escalate_text_localised: "Ask a volunteer",
};
plan.alternatives = [{ ...plan, gate_id: "gate_C", route_id: "c" }];
const bundle = {
  profile: { id: "p", name: "Person", lang: "en", group: null, location_at_end: "river" },
  plans: { NORMAL: plan }, names: {}, public_key: "public", fetched_at: "2026-10-08T00:00:00Z",
  walking: { routes: {
    a: { name: "A", gate_id: "gate_A", from: ["river"], walk_min: 5, covered: false, step_free: true },
    c: { name: "C", gate_id: "gate_C", from: ["river", "tent"], walk_min: 10, covered: true, step_free: false },
  }, connections: {} },
};

test("legacy bundle without walking or alternatives remains usable", () => {
  const old = normalizeBundle({ ...bundle, walking: undefined, profile: { ...bundle.profile, location_at_end: undefined }, plans: { NORMAL: { ...plan, alternatives: undefined } } }, "p");
  assert.ok(old);
  assert.deepEqual(old.plans.NORMAL.alternatives, []);
  assert.deepEqual(supportedZones(old, old.plans.NORMAL), []);
  assert.equal(crowdAwarePlan(old.plans.NORMAL, {}, old.walking, "").unavailable, false);
});
test("broken backend response and wrong person's cache are rejected", () => {
  assert.equal(normalizeBundle({ ...bundle, plans: undefined }, "p"), null);
  assert.equal(normalizeBundle(bundle, "other"), null);
  assert.equal(normalizeBundle(null, "p"), null);
});
test("partial walking metadata, invalid alternatives, map and dates are safe", () => {
  const normalized = normalizeBundle({ ...bundle, walking: { routes: { a: null } }, map: {}, plans: { NORMAL: { ...plan, alternatives: [null, {}, plan.alternatives[0]] } } }, "p");
  assert.deepEqual(normalized.walking, { routes: {}, connections: {} });
  assert.equal(normalized.map, undefined);
  assert.equal(normalized.plans.NORMAL.alternatives.length, 1);
  assert.equal(displayTime("invalid"), "Unknown");
});
test("zone options come from cached venue routes and stale selection is repaired", () => {
  assert.deepEqual(supportedZones(bundle, plan), ["river", "tent"]);
  assert.equal(resolveZone(bundle, plan, "unsupported"), "river");
  const result = crowdAwarePlan(plan, {}, bundle.walking, "tent");
  assert.equal(result.plan.route_id, "c");
  assert.deepEqual(result.plan.alternatives, []);
});
test("crowd reroutes and retains only usable alternative options", () => {
  const result = crowdAwarePlan(plan, { a: { level: "heavy", updated_at: "" } }, bundle.walking, "river");
  assert.equal(result.plan.route_id, "c");
  assert.equal(result.plan.alternatives[0].route_id, "a");
  const closed = crowdAwarePlan(plan, { a: { level: "closed", updated_at: "" } }, bundle.walking, "river");
  assert.equal(closed.plan.route_id, "c");
  assert.deepEqual(closed.plan.alternatives, []);
});
test("all closed, wrong origin and incident closure require staff assistance", () => {
  const crowd = normalizeCrowd({ a: { level: "closed" }, c: { level: "closed" } });
  assert.equal(crowdAwarePlan(plan, crowd, bundle.walking, "river").unavailable, true);
  assert.equal(crowdAwarePlan(plan, {}, bundle.walking, "unknown").unavailable, true);
  assert.equal(crowdAwarePlan(plan, {}, bundle.walking, "river", { gates: ["gate_A", "gate_C"], places: [], storm: false }).unavailable, true);
});
test("malformed crowd entries never produce undefined scores or crash UI", () => {
  assert.deepEqual(normalizeCrowd(null), {});
  assert.deepEqual(normalizeCrowd({ a: null, b: { level: "invalid" }, c: { level: "low", updated_at: "bad" } }), { c: { level: "low", updated_at: "" } });
});

test("persisted crowd state recovers from missing, partial and corrupt data", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const { execFileSync } = await import("node:child_process");
  const directory = mkdtempSync(join(tmpdir(), "planb-crowd-test-"));
  const modulePath = fileURLToPath(new URL("../../lib/crowd.ts", import.meta.url));
  try {
    execFileSync(process.execPath, ["--import", import.meta.resolve("tsx"), "-e", `
      const assert = require('node:assert/strict');
      const fs = require('node:fs');
      const { readCrowd, setCrowdLevel, resetCrowd, crowdPenalty } = require(${JSON.stringify(modulePath)});
      assert.deepEqual(readCrowd(), {});
      setCrowdLevel('route_A_open', 'heavy');
      assert.equal(readCrowd().route_A_open.level, 'heavy');
      assert.ok(readCrowd().route_A_open.updated_at);
      assert.equal(crowdPenalty('closed'), Infinity);
      fs.writeFileSync('data/state/crowd.json', JSON.stringify({route_A_open: null, fake: {level: 'low'}}));
      assert.deepEqual(readCrowd(), {});
      fs.writeFileSync('data/state/crowd.json', '{invalid');
      assert.deepEqual(readCrowd(), {});
      const reset = resetCrowd();
      assert.equal(Object.keys(reset).length, 6);
      assert.ok(Object.values(reset).every(state => state.level === 'low'));
    `], { cwd: directory, stdio: "pipe" });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
