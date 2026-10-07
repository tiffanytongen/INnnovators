import { connection } from "next/server";
import { loadProfiles } from "@/lib/data";
import { listProposals } from "@/lib/plan-revisions";

export async function GET() {
  await connection();
  const names = new Map(loadProfiles().map((p) => [p.id, p.name]));
  return Response.json({ proposals: listProposals().map((p) => ({ ...p, person_name: names.get(p.person_id) ?? p.person_id })) }, { headers: { "Cache-Control": "no-store" } });
}
