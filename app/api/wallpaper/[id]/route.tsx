// Lock-screen wallpaper: exit gate, transport and meetup point for each scenario. Works with the phone locked
// (or for a friend whose phone died: they can read yours). Key details in English so any volunteer can read them.
import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { loadProfiles, nameOf } from "@/lib/data";
import { readPlanFile } from "@/lib/generate";
import { parseScenario, describePart } from "@/lib/scenario";
import type { Plan } from "@/lib/plan";

const label = (code: string) => (code === "NORMAL" ? "Normal night" : (parseScenario(code) ?? []).map(describePart).join(" + "));

function line(p: Plan) {
  const t = p.transport;
  if (t.mode === "train") return `${t.line} · Plat ${t.platform} · ${t.depart}`;
  if (t.mode === "pickup") return `Pickup: ${nameOf(t.ref_id).replace(/ \(.*/, "")}`;
  return `${nameOf(t.ref_id).replace(/ \(.*/, "")}`;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await ctx.params;
  const profile = loadProfiles().find((p) => p.id === id);
  const file = readPlanFile(id);
  if (!profile || !file) return new Response("No plans for this person yet", { status: 404 });

  // One row per distinct plan; scenarios that lead to the same exit share a row.
  const sorted = Object.entries(file.plans).sort(([a], [b]) => (a === "NORMAL" ? -1 : b === "NORMAL" ? 1 : a.split("+").length - b.split("+").length));
  const merged = new Map<string, { codes: string[]; plan: Plan }>();
  for (const [code, p] of sorted) {
    const k = `${p.gate_id}|${line(p)}`;
    const row = merged.get(k) ?? { codes: [], plan: p };
    row.codes.push(code);
    merged.set(k, row);
  }
  const rows = [...merged.values()];
  const meetup = file.plans.NORMAL?.group_meetup ?? rows.find((r) => r.plan.group_meetup)?.plan.group_meetup;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#000", color: "#fff", padding: "0 70px", fontFamily: "sans-serif" }}>
        {/* top ~38% left empty for the lock-screen clock */}
        <div style={{ height: 900, display: "flex" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 30 }}>
          <div style={{ background: "#FFD400", color: "#000", fontSize: 54, fontWeight: 900, padding: "8px 26px", borderRadius: 18 }}>PLAN B</div>
          <div style={{ fontSize: 46, color: "#aaa" }}>{`${profile.name} · Fieldday`}</div>
        </div>
        {meetup && (
          <div style={{ display: "flex", flexDirection: "column", border: "4px solid #FFD400", borderRadius: 28, padding: "22px 30px", marginBottom: 30 }}>
            <div style={{ fontSize: 34, color: "#FFD400" }}>IF SEPARATED, MEET AT</div>
            <div style={{ fontSize: 52, fontWeight: 800 }}>{nameOf(meetup)}</div>
          </div>
        )}
        {rows.map(({ codes, plan: p }) => (
          <div key={codes.join()} style={{ display: "flex", alignItems: "center", gap: 28, padding: "16px 0", borderTop: "2px solid #333" }}>
            <div style={{ width: 110, height: 110, borderRadius: 22, background: "#fff", color: "#000", fontSize: 76, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {p.gate_id.replace("gate_", "")}
            </div>
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <div style={{ fontSize: 32, color: codes.includes("NORMAL") ? "#34d399" : "#FFD400" }}>
                {(label(codes[0]) + (codes.length > 1 ? ` · +${codes.length - 1} more` : "")).toUpperCase()}
              </div>
              <div style={{ fontSize: 44, fontWeight: 700 }}>{line(p)}</div>
            </div>
          </div>
        ))}
        <div style={{ display: "flex", marginTop: 30, fontSize: 32, color: "#888" }}>Phone dead? Show a volunteer this screen, or go to any info tent.</div>
      </div>
    ),
    { width: 1170, height: 2532, headers: { "Cache-Control": "no-store" } },
  );
}
