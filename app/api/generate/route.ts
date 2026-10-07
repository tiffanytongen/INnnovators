// Live: ask Claude for one person's plan right now, validate it, save it. Returns the attempt log too.
import { loadProfiles } from "@/lib/data";
import { generatePlan, writePlan } from "@/lib/generate";
import { canonicalCode } from "@/lib/scenario";

export async function POST(req: Request) {
  const { person_id, scenario } = await req.json();
  const profile = loadProfiles().find((p) => p.id === person_id);
  const sc = canonicalCode(scenario ?? "NORMAL");
  if (!profile || !sc) return Response.json({ error: "Unknown person or scenario" }, { status: 400 });
  const log: string[] = [];
  const started = Date.now();
  try {
    const plan = await generatePlan(profile, sc, (line: string) => log.push(line.trim()));
    if (plan) writePlan(plan);
    return Response.json({ plan, log, seconds: (Date.now() - started) / 1000 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e), log }, { status: 500 });
  }
}
