// Everything behind one person's plan: sign-up answers → rules-checked options → Claude's choice → validation.
import { connection } from "next/server";
import { loadProfiles, nameOf, scenarios, site, transport, toTime } from "@/lib/data";
import { readPlanFile, userPrompt } from "@/lib/generate";
import { worldFor, closedPlaces, leaveTime } from "@/lib/options";
import { parseScenario, describePart } from "@/lib/scenario";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await ctx.params;
  const scenario = new URL(req.url).searchParams.get("scenario") ?? "NORMAL";
  const profile = loadProfiles().find((p) => p.id === id);
  const parts = parseScenario(scenario);
  if (!profile || !parts) return Response.json({ error: "Unknown person or scenario" }, { status: 404 });

  const w = worldFor(parts);
  const { options, text } = userPrompt(profile, scenario);
  return Response.json({
    profile,
    scenario,
    scenario_label: parts.length ? parts.map(describePart).join(" + ") : "Normal night (Plan A)",
    scenarios: scenarios.precompute,
    leave: `${toTime(leaveTime(profile, w))} from ${nameOf(profile.location_at_end)}`,
    closed: closedPlaces(w).map(nameOf),
    options: options.map((o) => ({
      ...o,
      gate: nameOf(o.gate_id),
      route: nameOf(o.route_id),
      to: o.transport.mode === "train" ? `${o.transport.line} line train, platform ${o.transport.platform}` : nameOf(o.transport.ref_id),
    })),
    plan: readPlanFile(id)?.plans[scenario] ?? null,
    names: Object.fromEntries([...site.gates, ...site.routes, ...site.places, ...transport.shuttles, ...transport.taxis].map((x) => [x.id, nameOf(x.id)])),
    prompt: text,
  });
}
