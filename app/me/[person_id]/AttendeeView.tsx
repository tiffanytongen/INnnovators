"use client";
// Attendee screen. One action per screen, big text, high contrast. Works offline once loaded:
// the plan bundle lives in localStorage and the page shell in the service worker cache.
import { useEffect, useMemo, useState } from "react";
import type { Plan, PlanStep } from "@/lib/plan";
import { pickCachedScenario } from "@/lib/scenario";
import { verifyTrigger, type Trigger } from "@/lib/trigger";
import { strings } from "@/lib/i18n";
import type { MapData } from "@/lib/map";
import SiteMap from "@/app/components/SiteMap";

type Bundle = {
  profile: { id: string; name: string; lang: string; group: { size: number } | null };
  plans: Record<string, Plan>;
  names: Record<string, string>;
  public_key: string;
  fetched_at: string;
  map?: MapData;
  closed?: Record<string, { gates: string[]; places: string[]; storm: boolean }>;
};

const store = {
  get<T>(k: string): T | null {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};

const hhmm = (unix: number) => new Date(unix * 1000).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false });

export default function AttendeeView() {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [online, setOnline] = useState(true);
  const [step, setStep] = useState(0); // 0 = main plan, 1..n = alternatives, n+1 = escalate
  const [error, setError] = useState("");

  // Load the bundle: network first, then the copy saved on this phone.
  useEffect(() => {
    // Read the id from the URL directly (not useParams) so the page is a fully static shell the service worker can cache.
    const person_id = decodeURIComponent(location.pathname.split("/")[2] ?? "");
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    fetch(`/api/bundle/${person_id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((b: Bundle) => {
        store.set(`planb:bundle:${person_id}`, b);
        setTrigger(store.get<Trigger>("planb:trigger"));
        setBundle(b);
      })
      .catch(() => {
        const saved = store.get<Bundle>(`planb:bundle:${person_id}`);
        setTrigger(store.get<Trigger>("planb:trigger"));
        if (saved) setBundle(saved);
        else setError("Plan not found on this phone. Open your link once with signal.");
      });
  }, []);

  // Listen for triggers (simulated push/SMS). Needs some signal; verifies the signature locally.
  useEffect(() => {
    if (!bundle) return;
    const poll = async () => {
      try {
        const r = await fetch("/api/trigger", { cache: "no-store" });
        const { trigger: raw } = await r.json();
        setOnline(true);
        if (!raw) return;
        const t = verifyTrigger(raw, bundle.public_key);
        if (t && t.raw !== store.get<Trigger>("planb:trigger")?.raw) {
          store.set("planb:trigger", t);
          setTrigger(t);
          setStep(0);
          navigator.vibrate?.([200, 100, 200]);
        }
      } catch {
        setOnline(false);
      }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [bundle]);

  const current = useMemo(() => {
    if (!bundle) return null;
    const code = trigger?.code ?? "NORMAL";
    const { key, exact } = pickCachedScenario(code, Object.keys(bundle.plans));
    return { plan: bundle.plans[key] ?? bundle.plans["NORMAL"], key, exact: exact || code === "NORMAL", isPlanB: code !== "NORMAL" };
  }, [bundle, trigger]);

  if (error) return <Shell><p className="p-6 text-2xl">{error}</p></Shell>;
  if (!bundle || !current) return <Shell><p className="p-6 text-2xl">Loading your plan…</p></Shell>;
  if (!current.plan) return <Shell><p className="p-6 text-2xl">Your plan is still being prepared. Keep this page open.</p></Shell>;

  const t = strings(bundle.profile.lang);
  const plan = current.plan;
  const steps: PlanStep[] = [plan, ...plan.alternatives];
  const escalating = step >= steps.length;
  const s = steps[Math.min(step, steps.length - 1)];
  const accent = current.isPlanB ? "bg-[#FFD400] text-black" : "bg-emerald-600 text-white";
  const name = (id: string | null) => (id ? bundle.names[id] ?? id : "");

  return (
    <Shell>
      <header className={`${accent} px-5 py-3 flex items-center justify-between`}>
        <span className="text-xl font-black tracking-wide">{current.isPlanB ? t.planB : t.planA}</span>
        {current.isPlanB && trigger && <span className="text-sm font-bold">{hhmm(trigger.issued_at)}</span>}
      </header>
      <div className={`px-5 py-1.5 text-sm ${online ? "text-neutral-500" : "bg-[#F0EEE9] text-[#141414] font-semibold"}`}>
        {online ? `● ${t.online}` : `✈︎ ${t.offline}`}
      </div>

      {plan.needs_human && (
        <div className="mx-4 mt-3 rounded-xl bg-red-600 p-4 text-lg font-bold">{t.needsHuman}</div>
      )}
      {!current.exact && <div className="mx-4 mt-3 rounded-xl border border-neutral-300 p-3 text-sm text-neutral-700">{t.closestPlan}</div>}

      {escalating ? (
        <main className="flex-1 px-5 py-6 space-y-5">
          <p className="text-sm uppercase tracking-widest text-neutral-500">{t.escalateTitle}</p>
          <p className="text-4xl font-black leading-tight">{plan.escalate_text_localised}</p>
          {bundle.profile.lang !== "en" && <p className="text-xl text-neutral-700">Go to the nearest info tent or show this screen to any volunteer.</p>}
          <div className="rounded-2xl border-2 border-[#141414] p-4 text-lg">
            <p className="font-bold">{t.showVolunteer}</p>
            <p className="mt-2">Name: {bundle.profile.name} · ID {bundle.profile.id}</p>
            <p>Planned exit: {name(plan.gate_id)} → {plan.transport.line} {plan.transport.depart ?? ""}</p>
          </div>
        </main>
      ) : (
        <main className="flex-1 px-5 py-5 space-y-5">
          <div>
            <p className="text-sm uppercase tracking-widest text-neutral-500">
              {t.next}
              {step > 0 && ` · ${t.option} ${step + 1} ${t.of} ${steps.length}`}
            </p>
            <h1 className="mt-1 text-[2.1rem] font-black leading-tight">{s.text_localised}</h1>
            {bundle.profile.lang !== "en" && <p className="mt-1 text-lg text-neutral-700">{s.action}</p>}
          </div>

          {/* Fixed fields: never free-translated. English underneath so a volunteer can read them. */}
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 rounded-2xl bg-white border border-[#E7E4DD] p-4">
            <div className="row-span-1 flex h-16 w-16 items-center justify-center rounded-xl bg-[#141414] text-4xl font-black text-white">
              {s.gate_id.replace("gate_", "")}
            </div>
            <div>
              <p className="text-sm text-neutral-500">{t.gate}</p>
              <p className="text-lg font-bold">{name(s.gate_id)}</p>
              <p className="text-sm text-neutral-700">{name(s.route_id)}</p>
            </div>
            <Detail label={t[s.transport.mode]} big={s.transport.depart ?? ""}>
              {s.transport.mode === "train" ? `${s.transport.line} line · ${t.platform} ${s.transport.platform}` : name(s.transport.ref_id) || s.transport.line}
            </Detail>
            {s.wait_at && (
              <Detail label={t.wait} big={s.wait_until ? `${t.until} ${s.wait_until}` : ""}>
                {name(s.wait_at)}
              </Detail>
            )}
            {s.group_meetup && bundle.profile.group && (
              <Detail label={t.meet} big="">
                {name(s.group_meetup)}
              </Detail>
            )}
          </div>

          {bundle.map && (
            <SiteMap
              map={bundle.map}
              closedGates={bundle.closed?.[current.key]?.gates}
              closedPlaces={bundle.closed?.[current.key]?.places}
              storm={bundle.closed?.[current.key]?.storm}
              highlight={{ route_id: s.route_id, gate_id: s.gate_id, dest_id: s.transport.mode === "train" ? "flinders_st" : s.transport.platform, meetup_id: bundle.profile.group ? s.group_meetup : null }}
              className="w-full rounded-2xl border border-[#E7E4DD]"
            />
          )}

          {(s.volunteer_escort || s.notify_contact) && (
            <div className="space-y-2">
              {s.volunteer_escort && <Badge>🙋 {t.volunteer}</Badge>}
              {s.notify_contact && <Badge>✉︎ {t.contactNotified}</Badge>}
            </div>
          )}

          <div>
            <p className="text-sm uppercase tracking-widest text-neutral-500">{t.why}</p>
            <p className="text-xl">{s.reason_localised}</p>
            {bundle.profile.lang !== "en" && <p className="mt-1 text-sm text-neutral-500">{s.reason}</p>}
          </div>

          <p className="text-xs text-neutral-500">
            {t.source}: {plan.source}
            {current.isPlanB && trigger ? ` · approved ${hhmm(trigger.issued_at)}` : ""} · {t.savedOffline} {new Date(bundle.fetched_at).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false })}
          </p>
        </main>
      )}

      <footer className="sticky bottom-0 space-y-2 bg-[#F5F4F0] p-4">
        {!escalating && (
          <button onClick={() => setStep(step + 1)} className="w-full rounded-2xl border-2 border-[#141414] py-4 text-xl font-bold active:bg-[#141414] active:text-white">
            {t.notWork}
          </button>
        )}
        {online && step === 0 && (
          <a href={`/api/wallpaper/${bundle.profile.id}`} target="_blank" className="block text-center text-sm text-neutral-500 underline">
            Lock-screen wallpaper (works even if your phone is locked)
          </a>
        )}
        {step > 0 && (
          <button onClick={() => setStep(0)} className="w-full py-2 text-base text-neutral-500 underline">
            {t.backToFirst}
          </button>
        )}
      </footer>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-[#F5F4F0] text-[#141414]">{children}</div>;
}

function Detail({ label, big, children }: { label: string; big: string; children: React.ReactNode }) {
  return (
    <>
      <div className="flex w-16 items-center justify-center text-center text-lg font-black leading-tight text-[#141414]">{big}</div>
      <div>
        <p className="text-sm text-neutral-500">{label}</p>
        <p className="text-lg font-bold">{children}</p>
      </div>
    </>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-[#F0EEE9] px-4 py-3 text-lg font-semibold">{children}</p>;
}
