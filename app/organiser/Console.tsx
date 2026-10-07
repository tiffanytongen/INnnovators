"use client";
// Organiser console, in three plain steps:
// 1. Say what's happening → 2. Check what people will see → 3. Send. Technical detail is tucked under "Details".
import { useState } from "react";
import type { ParsedIncident } from "@/lib/parse-incident";
import type { Preview } from "@/lib/preview";
import { canonical, describePart, type ScenarioPart } from "@/lib/scenario";
import SiteMap from "@/app/components/SiteMap";

const DEMO_TEXT = "Storm at 11pm, Gate A closed, Sandringham line +25 min, accessible shuttle full";
const ICONS: Record<ScenarioPart["type"], string> = { STORM: "🌧", GATE_CLOSED: "🚫", TRAIN_DELAY: "🚆", SHUTTLE_FULL: "♿", HEAT: "🌡", SET_DELAY: "🎤" };
const WHO: Record<string, string> = { mei_19: "Mei, 19 · reads Mandarin · train home", tom_70: "Tom, 70 · wheelchair · booked shuttle", jake_16: "Jake, 16 · parent picking him up" };

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? r.statusText);
  return j;
}

function StepTitle({ n, children, done }: { n: number; children: React.ReactNode; done?: boolean }) {
  return (
    <h2 className="mb-3 flex items-center gap-3 text-xl font-black">
      <span className={`flex h-8 w-8 items-center justify-center rounded-full text-base ${done ? "bg-emerald-600 text-white" : "bg-[#141414] text-white"}`}>{done ? "✓" : n}</span>
      {children}
    </h2>
  );
}

export default function Console({ compact = false }: { compact?: boolean }) {
  const [text, setText] = useState(DEMO_TEXT);
  const [parsed, setParsed] = useState<ParsedIncident | null>(null);
  const [parts, setParts] = useState<ScenarioPart[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [approver, setApprover] = useState("Jess");
  const [sent, setSent] = useState<{ trigger: string; simulated_sms: { to: string; text: string }[] } | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function run(label: string, f: () => Promise<void>) {
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

  const refreshPreview = (ps: ScenarioPart[]) =>
    run("Updating…", async () => {
      setParts(ps);
      setPreview(ps.length ? await post<Preview>("/api/preview", { code: canonical(ps) }) : null);
    });

  const check = () =>
    run("Reading…", async () => {
      setSent(null);
      setPreview(null);
      const p = await post<ParsedIncident>("/api/parse", { text });
      setParsed(p);
      setParts(p.parts);
      if (p.code) setPreview(await post<Preview>("/api/preview", { code: p.code }));
    });

  const send = (code: string) =>
    run("Sending…", async () => {
      setSent(await post("/api/approve", { code, approved_by: approver, original_text: code === "NORMAL" ? "Reset to Plan A" : text }));
    });

  const resetAll = () =>
    run("Resetting…", async () => {
      await post("/api/approve", { code: "NORMAL", approved_by: approver, original_text: "Reset to Plan A" });
      setParsed(null);
      setParts([]);
      setPreview(null);
      setSent(null);
    });

  const card = "rounded-2xl bg-white border border-[#E7E4DD] p-5";

  return (
    <div className={`space-y-5 text-[#141414] ${compact ? "text-sm" : "text-base"}`}>
      {/* STEP 1 */}
      <section className={card}>
        <StepTitle n={1} done={!!parsed}>What&apos;s happening?</StepTitle>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} className="w-full rounded-xl border border-[#E7E4DD] bg-[#F5F4F0] p-3 text-lg" placeholder="Type it like a text message, e.g. storm at 11, gate A shut" />
        <button onClick={check} disabled={!!busy || !text.trim()} className="mt-3 rounded-xl bg-[#141414] px-5 py-2.5 text-lg font-bold text-white disabled:opacity-50">
          {busy === "Reading…" ? "AI is reading…" : "Check"}
        </button>

        {parsed && (
          <div className="mt-4 space-y-2">
            <p className="text-neutral-500">The AI understood this. Tap ✕ to remove anything that&apos;s wrong.</p>
            {parts.map((p, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl bg-[#F5F4F0] px-4 py-3">
                <span className="text-lg font-semibold">{ICONS[p.type]} {describePart(p)}</span>
                <button onClick={() => refreshPreview(parts.filter((_, j) => j !== i))} className="px-2 text-neutral-500 hover:text-[#141414]" aria-label="Remove">✕</button>
              </div>
            ))}
            {parsed.human_only.map((h) => (
              <div key={h.issue} className="rounded-xl bg-red-700 px-4 py-3 font-semibold">
                🚨 “{h.issue}” — this needs a person, not the app. Call security / first aid now. Plan B will not send this.
              </div>
            ))}
            {parsed.unmatched.length > 0 && <p className="text-neutral-500">Not understood (ignored): {parsed.unmatched.join("; ")}</p>}
          </div>
        )}
      </section>

      {/* STEP 2 */}
      {preview && (
        <section className={card}>
          <StepTitle n={2} done={!!sent}>What people will see</StepTitle>
          <p className="mb-4 text-lg">
            <b className="text-2xl">{preview.affected_people.toLocaleString()}</b> people get a new plan. Everyone else keeps their usual way home.
          </p>
          <figure className="mb-4">
            <SiteMap map={preview.map} closedGates={preview.closed_gates} closedPlaces={preview.closed_places} storm={preview.storm} gateDelta={preview.gate_delta} className="w-full rounded-xl border border-[#E7E4DD]" />
            <figcaption className="mt-1 text-sm text-neutral-500">Red = closed. Yellow badges = how many extra people each gate will get, so you know where to send staff.</figcaption>
          </figure>
          <div className={`grid gap-3 ${compact ? "grid-cols-1" : "md:grid-cols-3"}`}>
            {preview.samples.map((s) => (
              <div key={s.person_id} className="rounded-xl bg-[#F5F4F0] p-4">
                <p className="text-sm text-neutral-500">{WHO[s.person_id] ?? s.name}</p>
                {s.plan ? (
                  <>
                    <p className="mt-2 text-lg font-bold leading-snug">{s.plan.text_localised}</p>
                    {s.lang !== "en" && <p className="mt-1 text-neutral-500">“{s.plan.action}”</p>}
                  </>
                ) : (
                  <p className="mt-2 text-red-600">No plan generated yet</p>
                )}
              </div>
            ))}
          </div>
          {preview.simulated_sms.length > 0 && (
            <p className="mt-4 text-neutral-700">✉︎ Also texting {preview.simulated_sms.map((m) => m.to).join(", ")} the new pickup point.</p>
          )}
          {preview.no_plan_people > 0 && (
            <a href="/organiser/premortem" target={compact ? "_blank" : undefined} className="mt-4 block rounded-xl border border-red-500 px-4 py-3 text-red-700">
              ⚠ <b>{preview.no_plan_people} people</b> have no way home in this situation. <u>See the pre-mortem →</u>
            </a>
          )}
          {preview.needs_human.length > 0 && <p className="mt-3 text-amber-700">Staff should check on: {preview.needs_human.map((n) => n.name).join(", ")}</p>}

          <details className="mt-4 text-sm text-neutral-500">
            <summary className="cursor-pointer">Details</summary>
            <ul className="mt-2 space-y-1">
              {preview.by_part.map((b) => <li key={b.code}>{b.label}: {b.people.toLocaleString()} affected</li>)}
              <li>Code sent to phones: <span className="font-mono">{preview.code}</span></li>
              <li>Pre-made plans in this prototype: {preview.coverage.exact} exact, {preview.coverage.fallback} closest match, {preview.coverage.missing} not generated (production does everyone).</li>
            </ul>
          </details>
        </section>
      )}

      {/* STEP 3 */}
      {preview && (
        <section className={card}>
          <StepTitle n={3} done={!!sent}>Send</StepTitle>
          {sent ? (
            <div className="space-y-1">
              <p className="text-xl font-bold text-emerald-700">Sent ✓ Phones update within a few seconds.</p>
              <p className="text-neutral-500">Each phone already has its plan saved. We only sent a {sent.trigger.length}-character signed code, small enough for a weak signal.</p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={() => send(preview.code)} disabled={!!busy || !approver.trim()} className="rounded-xl bg-[#FFD400] px-6 py-3 text-xl font-black text-black disabled:opacity-50">
                {busy === "Sending…" ? "Sending…" : `Approve & send to ${preview.affected_people.toLocaleString()} phones`}
              </button>
              <label className="text-neutral-500">
                Approved by{" "}
                <input value={approver} onChange={(e) => setApprover(e.target.value)} className="ml-1 w-24 rounded-lg border border-[#E7E4DD] bg-[#F5F4F0] p-2 text-[#141414]" />
              </label>
            </div>
          )}
        </section>
      )}

      {error && <p className="rounded-xl bg-red-50 text-red-800 p-3">{error}</p>}
      {busy === "Updating…" && <p className="text-neutral-500">Updating…</p>}

      <button onClick={resetAll} disabled={!!busy} className="text-sm text-neutral-500 underline">
        All clear: put everyone back on Plan A
      </button>
    </div>
  );
}
