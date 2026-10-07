// Participant side: whose phone → home screen → full plan. Works offline once loaded.
// Look: dark by default; when Plan B is live the whole app flips to safety yellow (see App.tsx / theme.ts).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, Vibration, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { pickCachedScenario } from "../../lib/scenario";
import { verifyTrigger, type Trigger } from "../../lib/trigger";
import { strings } from "../../lib/i18n";
import SiteMap, { type MapData } from "./SiteMap";
import Signup from "./Signup";
import { getJSON, store, hhmm, s } from "./theme";
import { Btn, Field, Label, Notice, Ticket, Txt, usePal } from "./ui";

// ---- types (same shape as lib/plan.ts, kept local so the app doesn't pull in server code) ----
type Transport = { mode: "train" | "shuttle" | "taxi" | "pickup"; ref_id: string; line: string; platform: string; depart: string | null };
type Step = {
  action: string; gate_id: string; route_id: string; transport: Transport; group_meetup: string | null;
  wait_at: string | null; wait_until: string | null; volunteer_escort: boolean; notify_contact: boolean;
  reason: string; text_localised: string; reason_localised: string;
};
type Plan = Step & { source: string; alternatives: Step[]; escalate_text_localised: string; needs_human: boolean };
type Bundle = {
  profile: { id: string; name: string; lang: string; group: { size: number } | null };
  plans: Record<string, Plan>;
  names: Record<string, string>;
  public_key: string;
  fetched_at: string;
  map?: MapData;
  closed?: Record<string, { gates: string[]; places: string[]; storm: boolean }>;
};
type Strings = ReturnType<typeof strings>;

const HEROES = [
  { id: "mei_19", name: "Mei", desc: "19 · reads Mandarin · train home" },
  { id: "tom_70", name: "Tom", desc: "70 · wheelchair · booked shuttle" },
  { id: "jake_16", name: "Jake", desc: "16 · first festival · parent pickup" },
];

export default function Participant({ server, onServer, onAlert }: { server: string; onServer: (v: string) => void; onAlert: (on: boolean) => void }) {
  const [ready, setReady] = useState(false);
  const [personId, setPersonId] = useState<string | null>(null);
  const [signingUp, setSigningUp] = useState(false);
  useEffect(() => {
    store.get<string>("planb:person").then((p) => {
      if (p) setPersonId(p);
      setReady(true);
    });
  }, []);
  useEffect(() => {
    if (!personId) onAlert(false);
  }, [personId, onAlert]);
  useEffect(() => () => onAlert(false), [onAlert]); // leaving the participant side → back to night
  const choose = (id: string | null) => {
    setPersonId(id);
    if (id) store.set("planb:person", id);
    else AsyncStorage.removeItem("planb:person");
  };
  if (!ready) return null;
  if (signingUp) return <Signup server={server} onCancel={() => setSigningUp(false)} onDone={(id) => { setSigningUp(false); choose(id); }} />;
  return personId ? <PersonApp server={server} personId={personId} onSwitch={() => choose(null)} onAlert={onAlert} /> : <PickScreen server={server} onServer={onServer} onPick={choose} onSignup={() => setSigningUp(true)} />;
}

// ---------- demo: choose whose phone this is ----------
function PickScreen({ server, onServer, onPick, onSignup }: { server: string; onServer: (v: string) => void; onPick: (id: string) => void; onSignup: () => void }) {
  const p = usePal();
  const [other, setOther] = useState("");
  const [status, setStatus] = useState<"checking" | "ok" | "fail">("checking");
  useEffect(() => {
    setStatus("checking");
    getJSON(`${server}/api/trigger`).then(() => setStatus("ok"), () => setStatus("fail"));
  }, [server]);

  return (
    <ScrollView contentContainerStyle={{ paddingVertical: 28, gap: 22 }}>
      <View style={[s.gutter, { gap: 2 }]}>
        <Txt k="title" style={{ fontSize: 40, lineHeight: 48 }}>Plan A is your day.</Txt>
        <Txt k="title" c="accent" style={{ fontSize: 40, lineHeight: 48 }}>Plan B is what happens when it changes.</Txt>
      </View>

      <View style={s.gutter}>
        <Btn title="New here? Sign up" onPress={onSignup} />
      </View>

      <View style={{ gap: 4 }}>
        <Label style={s.gutter}>Open an attendee (demo)</Label>
        {HEROES.map((h) => (
          <Pressable key={h.id} accessibilityRole="button" onPress={() => onPick(h.id)} style={({ pressed }) => [s.gutter, { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: p.line }, pressed && { backgroundColor: p.raised }]}>
            <Txt k="huge" c="accent" style={{ width: 56, fontSize: 44, lineHeight: 52 }}>{h.name[0]}</Txt>
            <View style={{ flex: 1 }}>
              <Txt k="big">{h.name}</Txt>
              <Txt k="small" c="sub">{h.desc}</Txt>
            </View>
            <Txt k="big" c="sub">→</Txt>
          </Pressable>
        ))}
      </View>

      <View style={[s.gutter, { flexDirection: "row", gap: 8 }]}>
        <Field value={other} onChangeText={setOther} placeholder="Someone else? Their ID" autoCapitalize="none" style={{ flex: 1 }} />
        <Btn kind="line" title="Open" right="" onPress={() => other.trim() && onPick(other.trim())} style={{ minHeight: 50 }} />
      </View>

      <View style={[s.gutter, { gap: 8, marginTop: 12 }]}>
        <Label>Plan B server</Label>
        <Field value={server} onChangeText={onServer} autoCapitalize="none" autoCorrect={false} />
        <Txt k="smallStrong" c={status === "ok" ? "ok" : status === "fail" ? "danger" : "sub"}>
          {status === "ok" ? "● Connected" : status === "fail" ? "✕ Can't connect. Is the laptop server running, on the same Wi-Fi?" : "Checking…"}
        </Txt>
      </View>
    </ScrollView>
  );
}

// ---------- one attendee: data + home / plan screens ----------
function PersonApp({ server, personId, onSwitch, onAlert }: { server: string; personId: string; onSwitch: () => void; onAlert: (on: boolean) => void }) {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [online, setOnline] = useState(true);
  const [view, setView] = useState<"home" | "plan">("home");
  const [error, setError] = useState("");
  const lastRaw = useRef<string | null>(null);

  // Saved copy first (instant, offline), then refresh from the server.
  const refreshBundle = useCallback(async () => {
    try {
      const b = await getJSON<Bundle>(`${server}/api/bundle/${personId}`, 5000);
      await store.set(`planb:bundle:${personId}`, b);
      setBundle(b);
      setError("");
    } catch {
      const saved = await store.get<Bundle>(`planb:bundle:${personId}`);
      if (!saved) setError("Your plan isn't on this phone yet. Open the app once with signal.");
    }
  }, [server, personId]);

  useEffect(() => {
    (async () => {
      const [saved, t] = await Promise.all([store.get<Bundle>(`planb:bundle:${personId}`), store.get<Trigger>("planb:trigger")]);
      if (saved) setBundle(saved);
      if (t) { setTrigger(t); lastRaw.current = t.raw; }
      refreshBundle();
    })();
    const id = setInterval(refreshBundle, 30000);
    return () => clearInterval(id);
  }, [personId, refreshBundle]);

  // Updates from Fieldday (simulated push/SMS). Need some signal; verified on the phone with the cached public key.
  useEffect(() => {
    if (!bundle) return;
    const poll = async () => {
      try {
        const { trigger: raw } = await getJSON<{ trigger: string | null }>(`${server}/api/trigger`, 2500);
        setOnline(true);
        if (!raw || raw === lastRaw.current) return;
        const t = verifyTrigger(raw, bundle.public_key);
        if (!t) return; // forged or corrupted: ignore
        lastRaw.current = raw;
        store.set("planb:trigger", t);
        setTrigger(t);
        if (t.code !== "NORMAL") Vibration.vibrate([0, 250, 120, 250]);
      } catch {
        setOnline(false);
      }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [bundle, server]);

  const current = useMemo(() => {
    if (!bundle) return null;
    const code = trigger?.code ?? "NORMAL";
    const { key, exact } = pickCachedScenario(code, Object.keys(bundle.plans));
    return { plan: bundle.plans[key] ?? bundle.plans.NORMAL, key, exact: exact || code === "NORMAL", isPlanB: code !== "NORMAL" };
  }, [bundle, trigger]);

  // The whole app turns yellow while this person is on Plan B.
  useEffect(() => {
    onAlert(!!current?.isPlanB);
  }, [current?.isPlanB, onAlert]);

  if (!bundle || !current?.plan)
    return (
      <View style={{ padding: 20, gap: 16 }}>
        <Txt k="headline">{error || (bundle ? "Your plan is still being prepared." : "Loading your plan…")}</Txt>
        <Btn kind="ghost" title="Choose someone else" onPress={onSwitch} />
      </View>
    );

  const t = strings(bundle.profile.lang);
  const name = (id: string | null) => (id ? bundle.names[id] ?? id : "");
  const props = { bundle, plan: current.plan, scenarioKey: current.key, isPlanB: current.isPlanB, exact: current.exact, trigger, online, t, name, server };

  return view === "home"
    ? <HomeScreen {...props} onOpen={() => setView("plan")} onSwitch={onSwitch} />
    : <PlanScreen key={trigger?.raw ?? "NORMAL"} {...props} onBack={() => setView("home")} />; // new update → start from option 1
}

type ScreenProps = {
  bundle: Bundle; plan: Plan; scenarioKey: string; isPlanB: boolean; exact: boolean; trigger: Trigger | null; online: boolean;
  t: Strings; name: (id: string | null) => string; server: string;
};

// The map sits in a rounded panel, inset from the screen edges.
function RouteMap({ bundle, st, scenarioKey }: { bundle: Bundle; st: Step; scenarioKey: string }) {
  const p = usePal();
  if (!bundle.map) return null;
  const closed = bundle.closed?.[scenarioKey];
  return (
    <View style={[s.gutter]}>
      <View style={{ borderRadius: 22, overflow: "hidden", borderWidth: 2, borderColor: p.line }}>
        <SiteMap
          map={bundle.map}
          closedGates={closed?.gates}
          closedPlaces={closed?.places}
          storm={closed?.storm}
          highlight={{ route_id: st.route_id, gate_id: st.gate_id, dest_id: st.transport.mode === "train" ? "flinders_st" : st.transport.platform, meetup_id: bundle.profile.group ? st.group_meetup : null }}
        />
      </View>
    </View>
  );
}

function transportLine(st: Step, t: Strings, name: (id: string | null) => string) {
  const tr = st.transport;
  if (tr.mode === "train") return `${tr.line} line · ${t.platform} ${tr.platform}`;
  return name(tr.ref_id) || tr.line;
}
const gateLetter = (id: string) => id.replace("gate_", "");

function Stub({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Txt k="label" c="ticketSub">{label}</Txt>
      <Txt k="bodyStrong" c="onTicket" style={{ fontSize: 15, lineHeight: 20 }}>{value}</Txt>
    </View>
  );
}

// "Your ticket home": the departure time big, then exit / ride / route on the stub.
function HomeTicket({ st, t, name, title, onOpen, cta }: { st: Step; t: Strings; name: (id: string | null) => string; title: string; onOpen?: () => void; cta?: string }) {
  const p = usePal();
  return (
    <View style={s.gutter}>
      <Ticket
        top={
          <>
            <View style={s.between}>
              <Txt k="label" style={{ color: "#6B2E9E" }}>{title}</Txt>
              <Txt k="smallStrong" style={{ color: "#0E6E69" }}>{t[st.transport.mode]}</Txt>
            </View>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
              <Txt k="mega" c="onTicket" style={{ fontSize: st.transport.depart ? 72 : 96, lineHeight: st.transport.depart ? 80 : 100 }}>{st.transport.depart ?? gateLetter(st.gate_id)}</Txt>
              {st.transport.depart ? <Txt k="smallStrong" c="ticketSub" style={{ paddingBottom: 14, flexShrink: 1 }}>{t.departs.toLowerCase()}</Txt> : null}
            </View>
          </>
        }
        bottom={
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Stub label={t.gate} value={name(st.gate_id)} />
            <Stub label={t[st.transport.mode]} value={transportLine(st, t, name)} />
          </View>
        }
        footer={
          onOpen ? (
            <Pressable accessibilityRole="button" onPress={onOpen} style={({ pressed }) => [{ minHeight: 54, borderRadius: 16, backgroundColor: p.onTicket, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }, pressed && s.pressed]}>
              <Txt k="big" style={{ color: "#FFC94A" }}>{cta}</Txt>
              <Txt k="big" style={{ color: "#FFC94A" }}>→</Txt>
            </Pressable>
          ) : null
        }
      />
    </View>
  );
}

function SignalTag({ online }: { online: boolean }) {
  const p = usePal();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: p.line }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: online ? p.ok : p.sub }} />
      <Txt k="smallStrong">{online ? "Online" : "Offline · saved"}</Txt>
    </View>
  );
}

// ---------- HOME ----------
function HomeScreen({ bundle, plan, scenarioKey, isPlanB, trigger, online, t, name, server, onOpen, onSwitch }: ScreenProps & { onOpen: () => void; onSwitch: () => void }) {
  const was = bundle.plans.NORMAL;
  const wasChanged = isPlanB && was && (was.gate_id !== plan.gate_id || was.transport.depart !== plan.transport.depart);

  return (
    <ScrollView contentContainerStyle={{ paddingTop: 18, paddingBottom: 32, gap: 24 }}>
      <View style={[s.gutter, s.between, { alignItems: "center" }]}>
        <View style={{ flexShrink: 1 }}>
          <Txt k="title" c="accent">{t.hi} {bundle.profile.name}</Txt>
          <Txt k="label" c="sub" style={{ marginTop: 4 }}>{t.festivalDay}</Txt>
        </View>
        <SignalTag online={online} />
      </View>

      {/* Status: on Plan B the whole screen is already gold, so this is just the words, big. */}
      <Pressable accessibilityRole="button" onPress={onOpen} style={({ pressed }) => [s.gutter, { gap: 8 }, pressed && s.pressed]}>
        {isPlanB ? (
          <>
            <Label>{`${t.changed}${trigger ? ` · ${hhmm(trigger.issued_at)}` : ""}`}</Label>
            <Txt k="headline">{plan.text_localised}</Txt>
            {wasChanged ? (
              <Txt k="smallStrong" c="sub" style={{ textDecorationLine: "line-through" }}>
                Plan A: Gate {gateLetter(was.gate_id)}{was.transport.depart ? ` · ${was.transport.depart}` : ""} · {t[was.transport.mode]}
              </Txt>
            ) : null}
          </>
        ) : (
          <>
            <Txt k="headline">{t.allNormal}.</Txt>
            <Txt c="sub">{t.allNormalSub}</Txt>
          </>
        )}
      </Pressable>

      <HomeTicket st={plan} t={t} name={name} title={t.wayHome} onOpen={onOpen} cta={isPlanB ? t.tapForNext : t.seePlan} />

      <RouteMap bundle={bundle} st={plan} scenarioKey={scenarioKey} />

      {plan.group_meetup && bundle.profile.group && (
        <View style={[s.gutter, { gap: 4 }]}>
          <Label>{t.ifSeparated}</Label>
          <Txt k="headline">{name(plan.group_meetup)}</Txt>
        </View>
      )}

      <View style={[s.gutter, { gap: 2, alignItems: "center" }]}>
        <Txt k="small" c="sub">✓ {t.savedOnPhone}</Txt>
        <View style={{ flexDirection: "row", gap: 18 }}>
          {online && <Btn kind="ghost" title={t.wallpaper} onPress={() => Linking.openURL(`${server}/api/wallpaper/${bundle.profile.id}`)} style={{ minHeight: 44, paddingHorizontal: 0 }} />}
          <Btn kind="ghost" title="Switch person (demo)" onPress={onSwitch} style={{ minHeight: 44, paddingHorizontal: 0 }} />
        </View>
      </View>
    </ScrollView>
  );
}

// ---------- PLAN: one action, key details, why, "doesn't work for me" ----------
function PlanScreen({ bundle, plan, scenarioKey, isPlanB, exact, trigger, online, t, name, onBack }: ScreenProps & { onBack: () => void }) {
  const p = usePal();
  const [step, setStep] = useState(0);
  const steps: Step[] = [plan, ...plan.alternatives];
  const escalating = step >= steps.length;
  const st = steps[Math.min(step, steps.length - 1)];
  const notEn = bundle.profile.lang !== "en";

  return (
    <View style={{ flex: 1 }}>
      <View style={s.bar}>
        <Btn kind="ghost" title={`← ${t.home}`} onPress={onBack} style={{ paddingHorizontal: 0, minHeight: 44 }} />
        <View style={{ backgroundColor: p.name === "alert" ? p.ink : p.accent, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
          <Txt k="label" c="onAccent">{isPlanB ? t.planB : t.planA}{isPlanB && trigger ? ` · ${hhmm(trigger.issued_at)}` : ""}</Txt>
        </View>
      </View>
      {!online && <Txt k="smallStrong" style={{ paddingHorizontal: 20, paddingVertical: 8, backgroundColor: p.raised }}>{t.offline}</Txt>}

      <ScrollView contentContainerStyle={{ paddingTop: 20, paddingBottom: 24, gap: 20 }}>
        {(plan.needs_human || !exact) && (
          <View style={[s.gutter, { gap: 10 }]}>
            {plan.needs_human && <Notice>{t.needsHuman}</Notice>}
            {!exact && <Notice tone="ink">{t.closestPlan}</Notice>}
          </View>
        )}

        {escalating ? (
          <View style={[s.gutter, { gap: 16 }]}>
            <Label>{t.escalateTitle}</Label>
            <Txt k="headline">{plan.escalate_text_localised}</Txt>
            {notEn && <Txt c="sub">Go to the nearest info tent or show this screen to any volunteer.</Txt>}
            <View style={{ borderWidth: 2, borderColor: p.ink, borderRadius: 18, padding: 16, gap: 6 }}>
              <Txt k="big">{t.showVolunteer}</Txt>
              <Txt>Name: {bundle.profile.name} · ID {bundle.profile.id}</Txt>
              <Txt>Planned exit: {name(plan.gate_id)} → {plan.transport.line} {plan.transport.depart ?? ""}</Txt>
            </View>
          </View>
        ) : (
          <>
            <View style={[s.gutter, { gap: 10 }]}>
              <Label>{`${t.next}${step > 0 ? ` · ${t.option} ${step + 1} ${t.of} ${steps.length}` : ""}`}</Label>
              <Txt k="headline">{st.text_localised}</Txt>
              {notEn && <Txt c="sub">{st.action}</Txt>}
            </View>

            {/* Fixed fields from the data, never free-translated; English so a volunteer can read them. */}
            <HomeTicket st={st} t={t} name={name} title={t.wayHome} />
            <View style={[s.gutter]}>
              <Detail label={t.route} value={name(st.route_id)} />
              {st.wait_at && <Detail label={t.wait} value={name(st.wait_at)} time={st.wait_until} />}
              {st.group_meetup && bundle.profile.group && <Detail label={t.meet} value={name(st.group_meetup)} />}
            </View>

            <RouteMap bundle={bundle} st={st} scenarioKey={scenarioKey} />

            {(st.volunteer_escort || st.notify_contact) && (
              <View style={[s.gutter, { gap: 10 }]}>
                {st.volunteer_escort && <Notice tone="ink">{t.volunteer}</Notice>}
                {st.notify_contact && <Notice tone="ink">{t.contactNotified}</Notice>}
              </View>
            )}

            <View style={[s.gutter, { gap: 8 }]}>
              <Label>{t.why}</Label>
              <Txt>{st.reason_localised}</Txt>
              {notEn && <Txt k="small" c="sub">{st.reason}</Txt>}
              <Txt k="small" c="sub" style={{ marginTop: 6 }}>{t.source}: {plan.source}</Txt>
            </View>
          </>
        )}
      </ScrollView>

      <View style={{ padding: 16, paddingTop: 12, gap: 4 }}>
        {!escalating && <Btn title={t.notWork} right="↻" onPress={() => setStep(step + 1)} />}
        {step > 0 && <Btn kind="ghost" title={t.backToFirst} onPress={() => setStep(0)} />}
      </View>
    </View>
  );
}

function Detail({ label, value, time }: { label: string; value: string; time?: string | null }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: 1, borderTopColor: usePal().line, paddingVertical: 12 }}>
      <Txt k="label" c="sub" style={{ width: 92 }}>{label}</Txt>
      <Txt k="bodyStrong" style={{ flex: 1 }}>{value}</Txt>
      {time ? <Txt k="big">{time}</Txt> : null}
    </View>
  );
}

