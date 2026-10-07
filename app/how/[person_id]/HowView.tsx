"use client";
// "How the AI made this plan": sign-up answers → what's possible (rules) → what Claude chose and why → checks.
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { Plan, PlanStep } from "@/lib/plan";
import type { Profile } from "@/lib/data";
import type { Option } from "@/lib/options";

type Explain = {
  profile: Profile;
  scenario: string;
  scenario_label: string;
  scenarios: string[];
  leave: string;
  closed: string[];
  options: (Option & { gate: string; route: string; to: string })[];
  plan: Plan | null;
  names: Record<string, string>;
  prompt: string;
  error?: string;
};

const LANG: Record<string, string> = { en: "English", zh: "Mandarin (中文)", vi: "Vietnamese", ar: "Arabic", hi: "Hindi", es: "Spanish", ko: "Korean", it: "Italian", el: "Greek" };
const PEOPLE = [["mei_19", "Mei"], ["tom_70", "Tom"], ["jake_16", "Jake"]];
const same = (o: Option, s: PlanStep) => o.gate_id === s.gate_id && o.route_id === s.route_id && o.transport.ref_id === s.transport.ref_id && o.transport.depart === s.transport.depart;

function Step({ n, title, who, children }: { n: number; title: string; who: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white border border-[#E7E4DD] p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#141414] font-black text-white">{n}</span>
        <h2 className="text-xl font-black">{title}</h2>
        <span className={`rounded-full px-3 py-0.5 text-xs font-bold ${who === "AI" ? "bg-[#FFD400] text-black" : "bg-[#F0EEE9] text-neutral-700"}`}>{who}</span>
      </div>
      {children}
    </section>
  );
}

export default function HowView() {
  const { person_id } = useParams<{ person_id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const scenario = search.get("scenario") ?? "NORMAL";
  const [data, setData] = useState<Explain | null>(null);
  const [live, setLive] = useState<{ busy: boolean; log: string[]; seconds?: number; error?: string }>({ busy: false, log: [] });

  const load = useCallback(() => {
    fetch(`/api/explain/${person_id}?scenario=${encodeURIComponent(scenario)}`, { cache: "no-store" }).then((r) => r.json()).then(setData);
  }, [person_id, scenario]);
  useEffect(load, [load]);

  async function regenerate() {
    setLive({ busy: true, log: [] });
    const r = await fetch("/api/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ person_id, scenario }) });
    const j = await r.json();
    setLive({ busy: false, log: j.log ?? [], seconds: j.seconds, error: j.error });
    load();
  }

  if (!data) return <p className="p-8">Loading…</p>;
  if (data.error) return <p className="p-8">{data.error}</p>;
  const { profile: p, plan } = data;
  const go = (id: string, sc: string) => router.push(`/how/${id}?scenario=${encodeURIComponent(sc)}`);
  const committed = p.home.mode === "shuttle" ? p.home.booking : p.home.mode === "pickup" ? p.home.zone : null;

  const facts: [string, string][] = [
    ["Language", LANG[p.lang] ?? p.lang],
    ["Getting home", p.home.mode === "train" ? `Train · ${p.home.line} line` : p.home.mode === "shuttle" ? `Booked shuttle · ${data.names[p.home.booking] ?? p.home.booking}` : `Picked up by ${p.home.contact} · ${data.names[p.home.zone] ?? p.home.zone.replace(/_/g, " ")}`],
    ["Access needs", [p.access.wheelchair && "Wheelchair", p.access.step_free && "Step-free routes", p.access.low_vision && "Low vision", p.access.sensory && "Sensory"].filter(Boolean).join(", ") || "None"],
    ["Group", p.group ? `${p.group.size} people` : "On their own"],
    ["Age", `${p.age}${p.under_18 ? " (under 18)" : ""}${p.first_timer ? " · first festival" : ""}`],
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6">
      <header className="space-y-3">
        <h1 className="text-3xl font-black">How the AI made {p.name}&apos;s plan</h1>
        <div className="flex flex-wrap gap-2">
          {PEOPLE.map(([id, n]) => (
            <button key={id} onClick={() => go(id, scenario)} className={`rounded-full px-4 py-1.5 font-bold ${id === p.id ? "bg-[#141414] text-white" : "border border-neutral-300"}`}>{n}</button>
          ))}
          <select value={scenario} onChange={(e) => go(p.id, e.target.value)} className="rounded-full border border-neutral-300 bg-[#F5F4F0] px-3 py-1.5">
            {data.scenarios.map((s) => <option key={s} value={s}>{s === "NORMAL" ? "Normal night (Plan A)" : s}</option>)}
          </select>
        </div>
        <p className="text-lg text-neutral-700">Situation: <b>{data.scenario_label}</b></p>
      </header>

      <Step n={1} title={`What ${p.name} told us at sign-up`} who="30-second form">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {facts.map(([k, v]) => (
            <div key={k}><dt className="text-sm text-neutral-500">{k}</dt><dd className="text-lg font-semibold">{v}</dd></div>
          ))}
        </dl>
      </Step>

      <Step n={2} title="Every way home that's actually possible" who="Rules, not AI">
        <p className="mb-3 text-neutral-700">
          Leaves {data.leave}. {data.closed.length ? `Closed: ${data.closed.join(", ")}.` : "Nothing closed."} Checked against the venue map and timetables: open gates, {p.access.step_free ? "step-free only, " : ""}covered if it&apos;s storming, and a departure they can actually make.
        </p>
        <div className="space-y-2">
          {data.options.map((o, i) => {
            const chosen = plan && same(o, plan);
            const altRank = plan ? plan.alternatives.findIndex((a) => same(o, a)) : -1;
            return (
              <div key={i} className={`flex items-center gap-4 rounded-xl p-3 ${chosen ? "border-2 border-[#FFD400] bg-[#F5F4F0]" : "bg-[#F5F4F0]"}`}>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#141414] text-2xl font-black text-white">{o.gate_id.replace("gate_", "")}</span>
                <div className="flex-1">
                  <p className="font-semibold">{o.route} → {o.to}{o.transport.depart ? ` · ${o.transport.depart}` : ""}</p>
                  <p className="text-sm text-neutral-500">{o.facts[0]}</p>
                </div>
                {chosen ? <span className="rounded-full bg-[#FFD400] px-3 py-1 text-sm font-black text-black">AI&apos;s pick</span>
                  : altRank >= 0 ? <span className="rounded-full border border-neutral-400 px-3 py-1 text-sm">Backup {altRank + 1}</span>
                  : <span className="text-sm text-neutral-400">not used</span>}
              </div>
            );
          })}
        </div>
      </Step>

      <Step n={3} title="What the AI chose, and why" who="AI">
        {plan ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-[#F5F4F0] p-4">
              <p className="text-sm text-neutral-500">What {p.name}&apos;s phone says{p.lang !== "en" ? ` (in ${LANG[p.lang]})` : ""}</p>
              <p className="mt-1 text-2xl font-black leading-snug">{plan.text_localised}</p>
              {p.lang !== "en" && <p className="mt-1 text-neutral-500">“{plan.action}”</p>}
            </div>
            <div>
              <p className="text-sm text-neutral-500">The AI&apos;s reasoning</p>
              <p className="text-lg">{plan.reason}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              {plan.group_meetup && <span className="rounded-full bg-[#F0EEE9] px-3 py-1">Meet-up if separated: {data.names[plan.group_meetup] ?? plan.group_meetup.replace(/_/g, " ")}</span>}
              {plan.wait_at && <span className="rounded-full bg-[#F0EEE9] px-3 py-1">Wait first until {plan.wait_until}</span>}
              {plan.volunteer_escort && <span className="rounded-full bg-[#F0EEE9] px-3 py-1">Volunteer meets them</span>}
              {plan.notify_contact && <span className="rounded-full bg-[#F0EEE9] px-3 py-1">Contact gets a text</span>}
            </div>
            {plan.alternatives.length > 0 && (
              <div>
                <p className="text-sm text-neutral-500">Backups shown if they tap “Doesn&apos;t work for me” (work offline)</p>
                <ol className="mt-1 list-decimal space-y-1 pl-5">
                  {plan.alternatives.map((a, i) => <li key={i}><b>{a.action}</b> <span className="text-neutral-500">— {a.reason}</span></li>)}
                </ol>
              </div>
            )}
            <p className="text-sm text-neutral-500">Written by {plan.generated_by}.</p>
          </div>
        ) : (
          <p className="text-neutral-500">No plan yet for this situation. Click the button below.</p>
        )}
      </Step>

      <Step n={4} title="Checked before it's saved to the phone" who="Validator">
        {plan ? (
          <ul className="space-y-1.5 text-lg">
            <li>✅ Gate, route and transport exist in the venue data, and match one of the possible ways in step 2</li>
            <li>✅ Every time in the message is a real departure or scenario time (no made-up times in translation)</li>
            {committed && <li>✅ Keeps {p.name}&apos;s existing {p.home.mode === "pickup" ? "pickup point" : "booking"} if it still works (someone is relying on it)</li>}
            <li>{plan.needs_human ? "🚨 Flagged for staff: " + (plan.needs_human_reason ?? "") : "✅ No medical, lost-child or safety issue: safe for the app to handle"}</li>
            <li className="text-base text-neutral-500">If any check fails, the AI is told exactly what was wrong and tries again (up to 3 times).</li>
          </ul>
        ) : <p className="text-neutral-500">—</p>}
      </Step>

      <section className="rounded-2xl border border-[#FFD400] p-5">
        <button onClick={regenerate} disabled={live.busy} className="rounded-xl bg-[#FFD400] px-5 py-3 text-lg font-black text-black disabled:opacity-60">
          {live.busy ? "Claude is thinking… (about 15–30 s)" : "Make this plan again with AI, live"}
        </button>
        {(live.log.length > 0 || live.error) && (
          <div className="mt-3 space-y-1 font-mono text-sm">
            {live.log.map((l, i) => <p key={i} className={l.startsWith("✗") ? "text-red-600" : l.startsWith("✓") ? "text-emerald-700" : "text-neutral-700"}>{l}</p>)}
            {live.error && <p className="text-red-600">{live.error}</p>}
            {live.seconds && <p className="text-neutral-500">{live.seconds.toFixed(1)} s · page updated with the new plan</p>}
          </div>
        )}
      </section>

      <details className="text-sm text-neutral-500">
        <summary className="cursor-pointer">Exact prompt sent to the AI</summary>
        <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-[#F5F4F0] p-4 text-neutral-500">{data.prompt}</pre>
      </details>
    </div>
  );
}
