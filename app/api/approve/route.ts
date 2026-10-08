// The ONLY place a trigger gets signed. Called by the organiser's Approve button.
import { loadProfiles } from "@/lib/data";
import { canonicalCode } from "@/lib/scenario";
import { signTrigger } from "@/lib/trigger";
import { writeBroadcast } from "@/lib/state";
import { planFor, smsFor } from "@/lib/preview";

export async function POST(req: Request) {
  const { code, approved_by, original_text } = await req.json();
  const c = canonicalCode(code ?? "");
  if (!c) return Response.json({ error: `Unknown scenario code: ${code}` }, { status: 400 });
  if (!approved_by?.trim()) return Response.json({ error: "A named staff member must approve" }, { status: 400 });

  const simulated_sms = loadProfiles().flatMap((p) => {
    const { plan } = planFor(p.id, c);
    const sms = plan && c !== "NORMAL" ? smsFor(p, plan, planFor(p.id, "NORMAL").plan) : null;
    return sms ? [sms] : [];
  });
  const trigger = signTrigger(c);
  writeBroadcast({ trigger, code: c, approved_by, approved_at: new Date().toISOString(), original_text: original_text ?? "", simulated_sms });
  return Response.json({ trigger, simulated_sms });
}
