// Live AI replanning for a situation with no pre-made plan. Proposes only: nothing reaches a phone until
// a named organizer approves through /api/approve.
// POST { code, text } → proposal (which attendees, what changes and why)
import { canonicalCode } from "@/lib/scenario";
import { propose } from "@/lib/replan";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { code?: string; text?: string } | null;
  const code = canonicalCode(body?.code ?? "");
  if (!code || code === "NORMAL") return Response.json({ error: "Expected a disruption code" }, { status: 400 });
  const lines: string[] = [];
  const proposal = await propose(code, String(body?.text ?? "").slice(0, 500), (l) => { lines.push(l); console.log(l); });
  return Response.json({ ...proposal, log: lines });
}
