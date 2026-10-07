// Organiser adds (or clears) a resource, e.g. an extra accessible shuttle run, then the pre-mortem re-runs.
import { readFixes, writeFixes, runPremortem } from "@/lib/premortem";
import { site } from "@/lib/data";

const KINDS = ["accessible", "accessible_taxi", "general"];
const STOPS: Record<string, string> = { accessible: "shuttle_stop_batman_ave", general: "coach_bays", accessible_taxi: "accessible_taxi_rank" };

export async function POST(req: Request) {
  const body = await req.json();
  if (body.action === "reset") writeFixes([]);
  else {
    const { kind, depart, capacity } = body;
    if (!KINDS.includes(kind) || !/^\d{2}:\d{2}$/.test(depart) || !(capacity > 0 && capacity <= 2000))
      return Response.json({ error: "Need a kind, a HH:MM departure and a capacity" }, { status: 400 });
    const stop = STOPS[kind];
    if (!site.places.some((p) => p.id === stop)) return Response.json({ error: "Unknown stop" }, { status: 400 });
    const fixes = readFixes();
    const label = kind === "accessible_taxi" ? "Extra accessible taxis" : kind === "accessible" ? "Extra accessible shuttle" : "Extra general shuttle";
    fixes.push({ id: `extra_${kind}_${depart.replace(":", "")}_${fixes.length + 1}`, kind, name: `${label} ${depart}`, stop_id: stop, depart, capacity: Number(capacity) });
    writeFixes(fixes);
  }
  return Response.json(runPremortem());
}
