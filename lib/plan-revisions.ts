// Pending plans live separately from the approved bundle. Only approveProposal writes
// an active plan. Legacy seed plans remain approved at version 0 until replaced.
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { Plan } from "./plan";
import { canonicalCode } from "./scenario";

type VersionedPlan = Plan & {
  version?: number;
  approved_at?: string;
  approved_by?: string;
  approval_id?: string;
};
type WeatherPlan = Plan & { weather?: { simulated?: boolean }; journey?: { leave_at?: string; departure_id?: string } };
type PlanFile = { person_id: string; updated_at: string; plans: Record<string, VersionedPlan> };

export type PlanRevision = {
  id: string;
  person_id: string;
  scenario: string;
  previous: VersionedPlan | null;
  proposed: VersionedPlan;
  reason: string;
  change_summary: string[];
  baseline: { version: number; hash: string | null };
  forecast_fingerprint: string | null;
  created_at: string;
  status: "pending" | "approved" | "superseded";
  approved_at?: string;
  approved_by?: string;
};

export class RevisionError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "RevisionError";
  }
}

function assertId(id: string) {
  if (typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) {
    throw new RevisionError("Invalid plan or proposal identifier");
  }
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => [key, canonicalValue(v)]));
  }
  return value;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalValue(value))).digest("hex");
}

// Compare decisions, not generated wording or the forecast's retrieval timestamp.
// An unchanged recommendation does not interrupt staff with a new approval card.
export function planDecisionSignature(plan: Plan): string {
  const journey = (plan as WeatherPlan).journey;
  return hash({
    gate_id: plan.gate_id,
    route_id: plan.route_id,
    transport: { mode: plan.transport.mode, ref_id: plan.transport.ref_id, depart: plan.transport.depart },
    wait_at: plan.wait_at,
    wait_until: plan.wait_until,
    leave_at: journey?.leave_at ?? null,
    departure_id: journey?.departure_id ?? null,
    group_meetup: plan.group_meetup,
    volunteer_escort: plan.volunteer_escort,
    needs_human: plan.needs_human,
  });
}

function differences(previous: Plan | null, proposed: Plan): string[] {
  if (!previous) return ["Initial personalised journey requires organiser approval."];
  const changes: string[] = [];
  if (previous.route_id !== proposed.route_id || previous.gate_id !== proposed.gate_id) changes.push(`Route: ${previous.route_id} via ${previous.gate_id} → ${proposed.route_id} via ${proposed.gate_id}`);
  if (previous.transport.ref_id !== proposed.transport.ref_id || previous.transport.depart !== proposed.transport.depart) changes.push(`Transport: ${previous.transport.ref_id} ${previous.transport.depart ?? "unscheduled"} → ${proposed.transport.ref_id} ${proposed.transport.depart ?? "unscheduled"}`);
  if (previous.wait_at !== proposed.wait_at || previous.wait_until !== proposed.wait_until) changes.push(`Waiting: ${previous.wait_at ?? "none"}${previous.wait_until ? ` until ${previous.wait_until}` : ""} → ${proposed.wait_at ?? "none"}${proposed.wait_until ? ` until ${proposed.wait_until}` : ""}`);
  const previousLeave = (previous as WeatherPlan).journey?.leave_at;
  const proposedLeave = (proposed as WeatherPlan).journey?.leave_at;
  if (previousLeave !== proposedLeave) changes.push(`Start walking: ${previousLeave ?? "not specified"} → ${proposedLeave ?? "not specified"}`);
  if (previous.group_meetup !== proposed.group_meetup) changes.push(`Group meeting point: ${previous.group_meetup ?? "none"} → ${proposed.group_meetup ?? "none"}`);
  if (previous.volunteer_escort !== proposed.volunteer_escort || previous.needs_human !== proposed.needs_human) changes.push("Staff assistance requirements changed.");
  return changes;
}

function assertApprovable(plan: Plan) {
  assertId(plan.person_id);
  if (canonicalCode(plan.scenario) !== plan.scenario) throw new RevisionError("Plan scenario must be valid and canonical");
  if (/fallback|staff_review|simulat/i.test(plan.generated_by)) {
    throw new RevisionError("Fallback, staff-review and simulated plans cannot replace approved journeys");
  }
  if ((plan as WeatherPlan).weather?.simulated) throw new RevisionError("Simulated forecasts cannot be published to attendee plans");
}

function readJson<T>(filePath: string): T | null {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) as T : null;
}

function atomicWrite(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, filePath);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

export function createPlanRevisionStore(config: { plansDir: string; revisionsDir: string; now?: () => Date }) {
  const now = config.now ?? (() => new Date());
  const planPath = (id: string) => { assertId(id); return path.join(config.plansDir, `${id}.json`); };
  const revisionPath = (id: string) => { assertId(id); return path.join(config.revisionsDir, `${id}.json`); };
  const readPlanFile = (id: string): PlanFile | null => readJson<PlanFile>(planPath(id));
  const readProposal = (id: string): PlanRevision | null => readJson<PlanRevision>(revisionPath(id));

  function allProposals(): PlanRevision[] {
    if (!fs.existsSync(config.revisionsDir)) return [];
    return fs.readdirSync(config.revisionsDir).filter((file) => /^[A-Za-z0-9][A-Za-z0-9_-]*\.json$/.test(file))
      .map((file) => readJson<PlanRevision>(path.join(config.revisionsDir, file))!)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  function listProposals(): PlanRevision[] {
    return allProposals().filter((p) => p.status === "pending");
  }

  // The prototype uses local JSON persistence. An exclusive per-person lock also
  // protects against two server workers approving different baselines at once.
  function withLock<T>(personId: string, fn: () => T): T {
    assertId(personId);
    fs.mkdirSync(config.revisionsDir, { recursive: true });
    const lockPath = path.join(config.revisionsDir, `${personId}.lock`);
    let fd: number;
    try {
      fd = fs.openSync(lockPath, "wx", 0o600);
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid }));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new RevisionError("Another approval is in progress; retry shortly", 409);
      throw error;
    }
    try { return fn(); } finally { fs.closeSync(fd); fs.unlinkSync(lockPath); }
  }

  function proposePlan(plan: Plan, context: { forecast_fingerprint?: string } = {}): { status: "pending" | "unchanged"; proposal: PlanRevision | null } {
    assertApprovable(plan);
    return withLock(plan.person_id, () => {
      const previous = readPlanFile(plan.person_id)?.plans[plan.scenario] ?? null;
      const pending = listProposals().filter((p) => p.person_id === plan.person_id && p.scenario === plan.scenario);
      const signature = planDecisionSignature(plan);
      const baseline = { version: previous?.version ?? 0, hash: previous ? hash(previous) : null };
      const unchanged = previous !== null && planDecisionSignature(previous) === signature;
      const duplicate = pending.find((p) => p.baseline.hash === baseline.hash && planDecisionSignature(p.proposed) === signature);

      // A later forecast can withdraw an earlier suggestion by supporting the
      // active plan again; leave the active plan untouched and retire the card.
      for (const p of pending) {
        if (!unchanged && p.id === duplicate?.id) continue;
        atomicWrite(revisionPath(p.id), { ...p, status: "superseded" });
      }
      if (unchanged) return { status: "unchanged", proposal: null };
      if (duplicate) return { status: "pending", proposal: duplicate };

      const proposal: PlanRevision = {
        id: randomUUID(), person_id: plan.person_id, scenario: plan.scenario,
        previous, proposed: plan, reason: plan.reason,
        change_summary: differences(previous, plan), baseline,
        forecast_fingerprint: context.forecast_fingerprint ?? null,
        created_at: now().toISOString(), status: "pending",
      };
      atomicWrite(revisionPath(proposal.id), proposal);
      return { status: "pending", proposal };
    });
  }

  function approveProposal(id: string, approvedBy: string): { proposal: PlanRevision; plan: VersionedPlan } {
    assertId(id);
    if (typeof approvedBy !== "string" || !approvedBy.trim() || approvedBy.trim().length > 120) throw new RevisionError("A named organiser must approve (1–120 characters)");
    const initial = readProposal(id);
    if (!initial) throw new RevisionError("Unknown proposal", 404);
    return withLock(initial.person_id, () => {
      const proposal = readProposal(id)!;
      const file = readPlanFile(proposal.person_id) ?? { person_id: proposal.person_id, updated_at: "", plans: {} };
      const active = file.plans[proposal.scenario] ?? null;
      // The active file is the commit point. Recover safely if a server restart
      // happened after it was written but before the proposal was marked approved.
      if (active?.approval_id === id) {
        const completed: PlanRevision = { ...proposal, status: "approved", approved_at: active.approved_at, approved_by: active.approved_by };
        if (proposal.status !== "approved") atomicWrite(revisionPath(id), completed);
        return { proposal: completed, plan: active };
      }
      if (proposal.status !== "pending") throw new RevisionError("This proposal is no longer pending", 409);
      assertApprovable(proposal.proposed);
      if ((active?.version ?? 0) !== proposal.baseline.version || (active ? hash(active) : null) !== proposal.baseline.hash) {
        throw new RevisionError("The approved plan changed after this proposal. Refresh and review a new proposal", 409);
      }
      const approvedAt = now().toISOString();
      const plan: VersionedPlan = {
        ...proposal.proposed, version: (active?.version ?? 0) + 1,
        approved_at: approvedAt, approved_by: approvedBy.trim(), approval_id: id,
      };
      const approved: PlanRevision = { ...proposal, status: "approved", approved_at: approvedAt, approved_by: approvedBy.trim() };
      file.plans[proposal.scenario] = plan;
      file.updated_at = approvedAt;
      atomicWrite(planPath(proposal.person_id), file);
      atomicWrite(revisionPath(id), approved);
      return { proposal: approved, plan };
    });
  }

  return { proposePlan, listProposals, approveProposal, readProposal };
}

const store = createPlanRevisionStore({
  plansDir: path.join(process.cwd(), "data", "plans"),
  revisionsDir: path.join(process.cwd(), "data", "state", "plan-revisions"),
});
export const { proposePlan, listProposals, approveProposal } = store;
