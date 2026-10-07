"use client";
// Pre-mortem: who would have no viable plan, per scenario, before the festival. Add a resource → re-run → count drops.
import { useEffect, useState } from "react";
import Link from "next/link";
import type { PremortemReport } from "@/lib/premortem";

const DEMO = "STORM+GATE_A+TRAIN_SAND_25+SHUTTLE_FULL";

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? r.statusText);
  return j;
}

export default function PremortemPage() {
  const [report, setReport] = useState<PremortemReport | null>(null);
  const [selected, setSelected] = useState(DEMO);
  const [before, setBefore] = useState<number | null>(null);
  const [fix, setFix] = useState({ kind: "accessible", depart: "23:05", capacity: "150" });
  const [explain, setExplain] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/premortem", { cache: "no-store" }).then((r) => r.json()).then(setReport);
  }, []);

  if (!report) return <p className="p-8">Running every person through every scenario…</p>;
  const current = report.results.find((r) => r.scenario === selected) ?? report.results[0];

  async function act(label: string, f: () => Promise<void>) {
    setBusy(label);
    setError("");
    try {
      await f();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  const addFix = () =>
    act("Re-running…", async () => {
      setBefore(current.no_plan);
      setExplain("");
      setReport(await post<PremortemReport>("/api/premortem/fix", { ...fix, capacity: Number(fix.capacity) }));
    });

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-black">Plan B · Pre-mortem</h1>
        <Link href="/organiser" className="text-neutral-500 underline">← Organiser</Link>
      </header>
      <p className="text-neutral-500">
        Every attendee profile ({report.total_people.toLocaleString()} people) run through every scenario, with real gate, cover, step-free and seat limits. Weeks before the festival.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {report.results.map((r) => (
          <button
            key={r.scenario}
            onClick={() => { setSelected(r.scenario); setBefore(null); setExplain(""); }}
            className={`flex items-center justify-between rounded-xl border p-3 text-left ${r.scenario === current.scenario ? "border-[#141414]" : "border-[#E7E4DD]"}`}
          >
            <span className="font-mono text-sm">{r.scenario}</span>
            <span className={`text-xl font-black ${r.no_plan ? "text-red-600" : "text-emerald-700"}`}>{r.no_plan}</span>
          </button>
        ))}
      </div>

      <section className="space-y-4 rounded-2xl bg-white border border-[#E7E4DD] p-5">
        <p className="font-mono text-sm text-neutral-500">{current.scenario}</p>
        <p className="text-5xl font-black">
          {before !== null && before !== current.no_plan && <span className="text-neutral-500 line-through">{before}</span>}
          {before !== null && before !== current.no_plan && " → "}
          <span className={current.no_plan ? "text-red-600" : "text-emerald-700"}>{current.no_plan}</span>
          <span className="ml-3 text-2xl font-bold text-neutral-700">people have no viable plan</span>
        </p>

        {current.groups.length > 0 && (
          <table className="w-full text-left">
            <thead className="text-xs uppercase tracking-widest text-neutral-500">
              <tr><th className="py-1">Who</th><th>People</th><th>Why</th></tr>
            </thead>
            <tbody>
              {current.groups.map((g) => (
                <tr key={g.key} className="border-t border-[#E7E4DD] align-top">
                  <td className="py-2 pr-3 font-semibold">{g.label}</td>
                  <td className="pr-3 font-bold text-red-600">{g.people}</td>
                  <td className="text-neutral-700">{g.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {current.no_plan > 0 && (
          <div>
            <button onClick={() => act("Thinking…", async () => setExplain((await post<{ text: string }>("/api/premortem/explain", { scenario: current.scenario })).text))} disabled={!!busy} className="rounded-lg border border-neutral-400 px-3 py-1.5 disabled:opacity-50">
              {busy === "Thinking…" ? busy : "Explain with AI"}
            </button>
            {explain && <p className="mt-3 rounded-lg bg-[#F5F4F0] p-4 leading-relaxed">{explain}</p>}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3 border-t border-[#E7E4DD] pt-4">
          <label className="flex flex-col text-sm text-neutral-500">
            Add resource
            <select value={fix.kind} onChange={(e) => setFix({ ...fix, kind: e.target.value })} className="mt-1 rounded-lg border border-[#E7E4DD] bg-[#F5F4F0] p-2 text-[#141414]">
              <option value="accessible">Accessible shuttle run</option>
              <option value="accessible_taxi">Accessible taxis</option>
              <option value="general">General shuttle run</option>
            </select>
          </label>
          <label className="flex flex-col text-sm text-neutral-500">
            Departs
            <input value={fix.depart} onChange={(e) => setFix({ ...fix, depart: e.target.value })} className="mt-1 w-24 rounded-lg border border-[#E7E4DD] bg-[#F5F4F0] p-2 text-[#141414]" />
          </label>
          <label className="flex flex-col text-sm text-neutral-500">
            Seats
            <input value={fix.capacity} onChange={(e) => setFix({ ...fix, capacity: e.target.value })} className="mt-1 w-24 rounded-lg border border-[#E7E4DD] bg-[#F5F4F0] p-2 text-[#141414]" />
          </label>
          <button onClick={addFix} disabled={!!busy} className="rounded-lg bg-[#FFD400] px-5 py-2 font-black text-black disabled:opacity-50">
            {busy === "Re-running…" ? busy : "Add & re-run"}
          </button>
        </div>
        {error && <p className="text-red-600">{error}</p>}

        {report.fixes.length > 0 && (
          <div className="text-sm text-neutral-500">
            Added: {report.fixes.map((f) => `${f.name} (${f.capacity} seats)`).join(", ")}{" "}
            <button onClick={() => act("Resetting…", async () => { setBefore(null); setReport(await post<PremortemReport>("/api/premortem/fix", { action: "reset" })); })} className="underline">
              reset
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
