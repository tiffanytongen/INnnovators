// Phones poll this (simulates push/SMS delivery). Needs *some* connection; the plan itself is already on the phone.
import { connection } from "next/server";
import { readBroadcast } from "@/lib/state";
import { readCrowd } from "@/lib/crowd";

export async function GET() {
  await connection(); // always read live state at request time, never prerender
  const b = readBroadcast();
  return Response.json({ trigger: b?.trigger ?? null, crowd: readCrowd() });
}
