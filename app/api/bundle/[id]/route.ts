// Everything a phone needs to work offline: profile, all cached plans, place names, and the trigger public key.
import { connection } from "next/server";
import { loadProfiles, site, transport, nameOf } from "@/lib/data";
import { readPlanFile } from "@/lib/generate";
import { publicKey } from "@/lib/trigger";
import { mapPayload } from "@/lib/map";
import { worldFor, closedPlaces } from "@/lib/options";
import { parseScenario } from "@/lib/scenario";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await connection(); // always read live state at request time, never prerender
  const { id } = await ctx.params;
  const profile = loadProfiles().find((p) => p.id === id);
  if (!profile) return Response.json({ error: "unknown person" }, { status: 404 });
  const ids = [...site.gates, ...site.routes, ...site.places, ...transport.shuttles, ...transport.taxis].map((x) => x.id);
  const names = Object.fromEntries(ids.map((i) => [i, nameOf(i)]));
  const file = readPlanFile(id);
  // What's closed in each cached scenario, so the phone can draw it on the map offline.
  const closed = Object.fromEntries(
    Object.keys(file?.plans ?? {}).map((sc) => {
      const w = worldFor(parseScenario(sc) ?? []);
      return [sc, { gates: [...w.closedGates], places: closedPlaces(w), storm: w.storm }];
    }),
  );
  return Response.json({
    profile: { id: profile.id, name: profile.name, lang: profile.lang, group: profile.group, home: profile.home, access: profile.access, under_18: profile.under_18 },
    plans: file?.plans ?? {},
    names,
    public_key: publicKey(),
    map: mapPayload(),
    closed,
    fetched_at: new Date().toISOString(),
  });
}
