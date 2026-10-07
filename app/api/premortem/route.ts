import { connection } from "next/server";
import { runPremortem } from "@/lib/premortem";

export async function GET() {
  await connection(); // always recompute at request time
  return Response.json(runPremortem());
}
