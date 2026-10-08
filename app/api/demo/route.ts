// Demo Controls (organizer) and demo notification inboxes (attendee phone / contact's simulated phone).
// GET                         → attendees, what each scenario needs, recent notifications
// GET ?person=ID&audience=... → notifications that have arrived for that phone, plus any set-time changes
// POST { action: "trigger", person_id, scenario } | { action: "reset" }
import { connection } from "next/server";
import { candidates, inbox, recent, resetDemo, trigger, DELIVERY_DELAY_MS, type Scenario } from "@/lib/demo";

const SCENARIOS: Scenario[] = ["congestion", "delay", "pickup", "priority"];

export async function GET(req: Request) {
  await connection();
  const url = new URL(req.url);
  const person = url.searchParams.get("person");
  if (person) return Response.json(inbox(person, url.searchParams.get("audience") === "contact" ? "contact" : "attendee"));
  return Response.json({ attendees: candidates(), recent: recent() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (body?.action === "reset") {
    resetDemo();
    return Response.json({ ok: true });
  }
  if (body?.action === "trigger" && typeof body.person_id === "string" && SCENARIOS.includes(body.scenario as Scenario)) {
    const r = trigger(body.person_id, body.scenario as Scenario);
    if ("error" in r) return Response.json(r, { status: 400 });
    return Response.json({ note: r, arrives_in_ms: DELIVERY_DELAY_MS });
  }
  return Response.json({ error: "Expected { action: 'trigger', person_id, scenario } or { action: 'reset' }" }, { status: 400 });
}
