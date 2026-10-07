import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import type { Plan } from "../lib/plan";
import { createPlanRevisionStore, RevisionError } from "../lib/plan-revisions";

function fixture(overrides: Partial<Plan> = {}): Plan {
  return {
    person_id: "attendee_1", scenario: "NORMAL", source: "Fieldday Ops", lang: "en",
    action: "Use Gate A", gate_id: "gate_A", route_id: "river_to_A",
    transport: { mode: "train", ref_id: "train_SAND", line: "Sandringham", platform: "1", depart: "22:52" },
    group_meetup: null, wait_at: null, wait_until: null, volunteer_escort: false,
    reason: "The shorter route fits your departure.", text_localised: "Use Gate A", reason_localised: "A short walk.",
    notify_contact: false, arrive: "22:45", alternatives: [],
    escalate_text_localised: "Ask a volunteer for help.", confidence: "high", needs_human: false,
    needs_human_reason: null, generated_by: "claude-test", ...overrides,
  };
}

function setup(t: TestContext) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "plan-b-revisions-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const plansDir = path.join(dir, "plans");
  const revisionsDir = path.join(dir, "revisions");
  const store = createPlanRevisionStore({ plansDir, revisionsDir, now: () => new Date("2026-10-08T10:00:00Z") });
  const filePath = path.join(plansDir, "attendee_1.json");
  const seed = (plan: Plan) => {
    fs.mkdirSync(plansDir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({ person_id: plan.person_id, updated_at: "legacy", plans: { NORMAL: plan } }));
  };
  return { ...store, seed, dir, filePath, revisionsDir };
}

test("reads are side-effect free; initial generation stays pending until named approval", (t) => {
  const store = setup(t);
  assert.deepEqual(store.listProposals(), []);
  assert.equal(fs.existsSync(store.revisionsDir), false);
  const result = store.proposePlan(fixture());
  assert.equal(result.status, "pending");
  assert.equal(fs.existsSync(store.filePath), false, "pending initial plan cannot reach the attendee bundle");
  assert.throws(() => store.approveProposal(result.proposal!.id, " "), /named organiser/);
  assert.equal(fs.existsSync(store.filePath), false);
  const { plan } = store.approveProposal(result.proposal!.id, "Jess");
  assert.equal(plan.version, 1);
  assert.equal(plan.approved_by, "Jess");
  assert.equal(plan.approved_at, "2026-10-08T10:00:00.000Z");
  assert.deepEqual(store.listProposals(), []);
});

test("weather revisions preserve the approved plan byte-for-byte until approval", (t) => {
  const store = setup(t);
  store.seed(fixture());
  const before = fs.readFileSync(store.filePath, "utf8");
  const result = store.proposePlan(fixture({ route_id: "river_to_C", gate_id: "gate_C", reason: "More shelter during your walk." }));
  assert.equal(fs.readFileSync(store.filePath, "utf8"), before);
  assert.equal(result.proposal?.previous?.route_id, "river_to_A");
  assert.equal(result.proposal?.proposed.route_id, "river_to_C");
  const approved = store.approveProposal(result.proposal!.id, "Jess");
  assert.equal(JSON.parse(fs.readFileSync(store.filePath, "utf8")).plans.NORMAL.route_id, "river_to_C");
  assert.equal(approved.plan.version, 1, "legacy plans count as version 0");
  assert.equal(store.approveProposal(result.proposal!.id, "Jess").plan.version, 1, "retrying approval is idempotent");
});

test("identical decisions do not repeatedly create proposals when wording or forecast fingerprint changes", (t) => {
  const store = setup(t);
  store.seed(fixture());
  assert.equal(store.proposePlan(fixture({ reason: "Updated forecast still favours this route." })).status, "unchanged");
  const first = store.proposePlan(fixture({ route_id: "covered" }), { forecast_fingerprint: "forecast-1" });
  const duplicate = store.proposePlan(fixture({ route_id: "covered", reason: "New wording" }), { forecast_fingerprint: "forecast-2" });
  assert.equal(first.proposal?.id, duplicate.proposal?.id);
  assert.equal(store.listProposals().length, 1);
  store.proposePlan(fixture());
  assert.equal(store.listProposals().length, 0, "forecast supporting the active plan withdraws obsolete pending changes");
  assert.throws(() => store.approveProposal(first.proposal!.id, "Jess"), /no longer pending/);
});

test("a changed approved baseline prevents an old proposal replacing a newer decision", (t) => {
  const store = setup(t);
  store.seed(fixture());
  const result = store.proposePlan(fixture({ route_id: "covered" }));
  store.seed(fixture({ route_id: "staff_updated_route" }));
  assert.throws(() => store.approveProposal(result.proposal!.id, "Jess"), (error) => error instanceof RevisionError && error.status === 409);
  assert.equal(JSON.parse(fs.readFileSync(store.filePath, "utf8")).plans.NORMAL.route_id, "staff_updated_route");
});

test("a revised walking departure time requires approval", (t) => {
  const store = setup(t);
  store.seed(fixture());
  const plan = { ...fixture(), journey: { option_id: "option-1", departure_id: "train_SAND_2252", leave_at: "22:32", boarding_deadline: "22:50", main_tradeoff: "Avoid rain", forecast_times: [], missing_information: [] } };
  const result = store.proposePlan(plan);
  assert.equal(result.status, "pending");
  assert.ok(result.proposal?.change_summary.some((line) => line.startsWith("Start walking:")));
});

test("simulation and fallback cannot enter attendee approval flow", (t) => {
  const store = setup(t);
  assert.throws(() => store.proposePlan(fixture({ generated_by: "rules_fallback" })), /cannot replace/);
  assert.throws(() => store.proposePlan(fixture({ generated_by: "staff_review" })), /cannot replace/);
  const simulated = { ...fixture(), weather: { simulated: true } } as unknown as Plan;
  assert.throws(() => store.proposePlan(simulated), /Simulated forecasts/);
  assert.equal(fs.existsSync(store.filePath), false);
});

test("identifiers cannot escape the plan store and scenario names must be canonical", (t) => {
  const store = setup(t);
  assert.throws(() => store.proposePlan(fixture({ person_id: "../outside" })), /Invalid/);
  assert.throws(() => store.approveProposal("../../outside", "Jess"), /Invalid/);
  assert.throws(() => store.proposePlan(fixture({ scenario: "made-up" })), /canonical/);
  assert.equal(fs.existsSync(store.filePath), false);
});
