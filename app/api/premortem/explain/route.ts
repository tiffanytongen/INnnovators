// Claude explains the (deterministic) pre-mortem result for one scenario and suggests fixes. It does not change the count.
import { claude, MODEL, FALLBACK_OPTS } from "@/lib/claude";
import { runPremortem } from "@/lib/premortem";
import { site, transport } from "@/lib/data";

export async function POST(req: Request) {
  const { scenario } = await req.json();
  const report = runPremortem();
  const r = report.results.find((x) => x.scenario === scenario);
  if (!r) return Response.json({ error: "Unknown scenario" }, { status: 400 });
  if (r.no_plan === 0) return Response.json({ text: "Everyone has at least one viable plan in this scenario." });

  const res = await claude().beta.messages.create({
    model: MODEL,
    max_tokens: 2000,
    ...FALLBACK_OPTS,
    output_config: { effort: "low" },
    system:
      "You brief a festival operations lead (Jess, 5 staff) on a pre-mortem result. Plain English, no headings, max 90 words. Say who is stuck and the root cause in one or two sentences, then give one or two concrete fixes she could book weeks ahead (e.g. an extra accessible shuttle run at a stated time and seat count, more accessible taxis, a covered step-free walkway). Use only facts from the data given; don't invent numbers beyond simple arithmetic on them.",
    messages: [
      {
        role: "user",
        content: `Scenario: ${scenario}\nPeople with no viable plan: ${r.no_plan} of ${report.total_people}\nGroups: ${JSON.stringify(r.groups)}\nGates: ${JSON.stringify(site.gates.map(({ id, covered, step_free, connects_to }) => ({ id, covered, step_free, connects_to })))}\nLimited-seat services: ${JSON.stringify([...transport.shuttles, ...transport.taxis, ...report.fixes].map(({ id, depart, capacity, kind }) => ({ id, depart, capacity, kind })))}`,
      },
    ],
  });
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return Response.json({ text });
}
