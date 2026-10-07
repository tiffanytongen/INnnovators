// Participant side: whose phone → home screen → full plan. Works offline once loaded.
// Look: pastel-green header band + white cards; when Plan B is live the band and accents flip to coral.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, Vibration, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { pickCachedScenario } from "../../lib/scenario";
import { verifyTrigger, type Trigger } from "../../lib/trigger";
import { strings } from "../../lib/i18n";
import SiteMap, { type MapData } from "./SiteMap";
import Signup from "./Signup";
import { getJSON, store, hhmm, s } from "./theme";
import { Badge, Band, Btn, Card, Field, Journey, Label, Notice, TabBar, Txt, usePal } from "./ui";

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
    <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
      <Band height={210}>
        <View style={[s.gutter, { paddingTop: 18, paddingBottom: 26, gap: 6 }]}>
          <Txt k="title">Whose phone is this?</Txt>
          <Txt c="sub">Plan A is your day. Plan B is what happens when it changes.</Txt>
        </View>
        <View style={[s.gutter, { gap: 12 }]}>
          <Card onPress={onSignup} label="Sign up" style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: p.accent, alignItems: "center", justifyContent: "center" }}>
              <Txt k="big" c="onAccent">+</Txt>
            </View>
            <View style={{ flex: 1 }}>
              <Txt k="big">New here? Sign up</Txt>
              <Txt k="small" c="sub">30 seconds to make your plan</Txt>
            </View>
          </Card>
        </View>
      </Band>

      <View style={[s.gutter, { gap: 12, marginTop: 26 }]}>
        <Label>Demo attendees</Label>
        {HEROES.map((h) => (
          <Card key={h.id} onPress={() => onPick(h.id)} label={h.name} style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 16 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: p.badgeBg, alignItems: "center", justifyContent: "center" }}>
              <Txt k="big" c="badgeInk">{h.name[0]}</Txt>
            </View>
            <View style={{ flex: 1 }}>
              <Txt k="big">{h.name}</Txt>
              <Txt k="small" c="sub">{h.desc}</Txt>
            </View>
            <Txt k="big" c="sub">›</Txt>
          </Card>
        ))}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Field value={other} onChangeText={setOther} placeholder="Someone else? Their ID" accessibilityLabel="Attendee ID" autoCapitalize="none" style={{ flex: 1, minWidth: 0 }} />
          <Btn kind="line" title="Open" onPress={() => other.trim() && onPick(other.trim())} style={{ minHeight: 50 }} />
        </View>
      </View>

      <View style={[s.gutter, { gap: 8, marginTop: 28 }]}>
        <Txt k="label" c="sub">Plan B server</Txt>
        <Field value={server} onChangeText={onServer} accessibilityLabel="Plan B server" autoCapitalize="none" autoCorrect={false} />
        <Txt k="smallStrong" c={status === "ok" ? "ok" : status === "fail" ? "danger" : "sub"}>
          {status === "ok" ? "Connected" : status === "fail" ? "Can't connect. Is the laptop server running, on the same Wi-Fi?" : "Checking…"}
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

// The map inside a card.
function RouteMap({ bundle, st, scenarioKey }: { bundle: Bundle; st: Step; scenarioKey: string }) {
  const p = usePal();
  if (!bundle.map) return null;
  const closed = bundle.closed?.[scenarioKey];
  return (
    <View style={{ borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: p.line }}>
      <SiteMap
        map={bundle.map}
        closedGates={closed?.gates}
        closedPlaces={closed?.places}
        storm={closed?.storm}
        highlight={{ route_id: st.route_id, gate_id: st.gate_id, dest_id: st.transport.mode === "train" ? "flinders_st" : st.transport.platform, meetup_id: bundle.profile.group ? st.group_meetup : null }}
      />
    </View>
  );
}

function transportLine(st: Step, t: Strings, name: (id: string | null) => string) {
  const tr = st.transport;
  if (tr.mode === "train") return `${tr.line} line · ${t.platform} ${tr.platform}`;
  return name(tr.ref_id) || tr.line;
}
const gateLetter = (id: string) => id.replace("gate_", "");

// The main card: brand row + badge, one big number (departure time), a chevron to open the plan.
function MainCard({ st, t, isPlanB, trigger, onOpen }: { st: Step; t: Strings; isPlanB: boolean; trigger: Trigger | null; onOpen?: () => void }) {
  const p = usePal();
  return (
    <Card style={{ paddingBottom: onOpen ? 8 : 20 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: p.accent, alignItems: "center", justifyContent: "center" }}>
          <Txt k="label" c="onAccent">B</Txt>
        </View>
        <View style={{ width: 1, height: 22, backgroundColor: p.line }} />
        <Txt k="bodyStrong" style={{ flex: 1 }}>Fieldday</Txt>
        <Badge>{isPlanB ? `Plan B${trigger ? ` · ${hhmm(trigger.issued_at)}` : ""}` : "Plan A · Tonight"}</Badge>
      </View>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 8, paddingVertical: 4 }}>
        <Txt k="mega">{st.transport.depart ?? gateLetter(st.gate_id)}</Txt>
        <Txt k="bodyStrong" c="sub">{st.transport.depart ? `Gate ${gateLetter(st.gate_id)}` : t.gate}</Txt>
      </View>
      <Txt k="small" c="sub" style={{ textAlign: "center", marginTop: -8 }}>{t[st.transport.mode]} · {t.departs.toLowerCase()}</Txt>
      {onOpen ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t.seePlan} onPress={onOpen} style={({ pressed }) => [{ alignSelf: "center", width: 48, height: 40, alignItems: "center", justifyContent: "center" }, pressed && s.pressed]}>
          <Txt k="big" c="sub" style={{ transform: [{ rotate: "90deg" }] }}>›</Txt>
        </Pressable>
      ) : null}
    </Card>
  );
}

function SignalPill({ online }: { online: boolean }) {
  const p = usePal();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.7)" }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: online ? p.ok : p.sub }} />
      <Txt k="label">{online ? "Online" : "Offline · saved"}</Txt>
    </View>
  );
}

// ---------- HOME ----------
function HomeScreen({ bundle, plan, scenarioKey, isPlanB, trigger, online, t, name, server, onOpen, onSwitch }: ScreenProps & { onOpen: () => void; onSwitch: () => void }) {
  const p = usePal();
  const was = bundle.plans.NORMAL;
  const wasChanged = isPlanB && was && (was.gate_id !== plan.gate_id || was.transport.depart !== plan.transport.depart);
  const backups = plan.alternatives ?? [];

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <Band height={230}>
          <View style={[s.gutter, { paddingTop: 14, paddingBottom: 20 }]}>
            <View style={[s.between, { alignItems: "center" }]}>
              <Txt k="title">{t.hi} {bundle.profile.name}</Txt>
              <SignalPill online={online} />
            </View>
            <Txt k="headline" c="sub" style={{ fontFamily: "Jost_400Regular" }}>{t.festivalDay}</Txt>
          </View>
          <View style={s.gutter}>
            <MainCard st={plan} t={t} isPlanB={isPlanB} trigger={trigger} onOpen={onOpen} />
          </View>
        </Band>

        <View style={[s.gutter, { gap: 16, marginTop: 16 }]}>
          {/* Status: what's happening and what to do */}
          <Card onPress={onOpen} label={t.seePlan}>
            {isPlanB ? (
              <>
                <Txt>
                  <Txt k="bodyStrong">{t.changed}{trigger ? ` at ${hhmm(trigger.issued_at)}` : ""}: </Txt>
                  {plan.text_localised}{" "}
                  <Txt k="bodyStrong" style={{ textDecorationLine: "underline" }}>{t.tapForNext}.</Txt>
                </Txt>
                {wasChanged ? (
                  <Txt k="small" c="sub" style={{ textDecorationLine: "line-through" }}>
                    Plan A: Gate {gateLetter(was.gate_id)}{was.transport.depart ? ` · ${was.transport.depart}` : ""} · {t[was.transport.mode]}
                  </Txt>
                ) : null}
              </>
            ) : (
              <Txt>
                <Txt k="bodyStrong">{t.allNormal}. </Txt>
                {t.allNormalSub}{" "}
                <Txt k="bodyStrong" style={{ textDecorationLine: "underline" }}>{t.seePlan}.</Txt>
              </Txt>
            )}
            <View style={{ marginTop: 6 }}>
              <Journey groups={[{ label: "Walk", dots: 3, active: true }, { label: `Gate ${gateLetter(plan.gate_id)}`, dots: 2 }, { label: t[plan.transport.mode], dots: 3 }]} />
            </View>
          </Card>

          {/* Route */}
          <Card>
            <Txt k="headline">{t.wayHome}</Txt>
            <Txt c="sub" style={{ marginTop: -8 }}>{name(plan.gate_id)} · {transportLine(plan, t, name)}</Txt>
            <RouteMap bundle={bundle} st={plan} scenarioKey={scenarioKey} />
          </Card>

          {plan.group_meetup && bundle.profile.group && (
            <Card>
              <Txt k="label" c="sub">{t.ifSeparated}</Txt>
              <Txt k="headline">{name(plan.group_meetup)}</Txt>
            </Card>
          )}

          {backups.length > 0 && (
            <View style={{ gap: 12, marginTop: 6 }}>
              <Label>Backup options ({backups.length})</Label>
              {backups.map((b, i) => (
                <Card key={i} onPress={onOpen} label={`${t.option} ${i + 2}`} style={{ flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: p.raised }}>
                  <View style={{ flex: 1, gap: 6 }}>
                    <Badge>{`${t.option} ${i + 2}`}</Badge>
                    <Txt k="small" numberOfLines={3}>{b.text_localised}</Txt>
                  </View>
                  {b.transport.depart ? <Txt k="huge" style={{ fontSize: 30, lineHeight: 36 }}>{b.transport.depart}</Txt> : null}
                </Card>
              ))}
            </View>
          )}

          <Txt k="small" c="sub" style={{ textAlign: "center", marginTop: 4 }}>{t.savedOnPhone}</Txt>
        </View>
      </ScrollView>

      <TabBar
        items={[
          { icon: "home", label: t.home, onPress: () => {}, active: true },
          { icon: "map", label: "Map", onPress: onOpen },
          { icon: "phone", label: "Wallpaper", onPress: () => online && Linking.openURL(`${server}/api/wallpaper/${bundle.profile.id}`) },
          { icon: "user", label: "Switch", onPress: onSwitch },
        ]}
        center={{ label: "My plan", onPress: onOpen }}
      />
    </View>
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
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <Band height={escalating ? 200 : 230}>
          <View style={[s.gutter, { paddingTop: 6, paddingBottom: 18, gap: 10 }]}>
            <View style={[s.between, { alignItems: "center" }]}>
              <Btn kind="ghost" title={`‹ ${t.home}`} onPress={onBack} />
              <Badge>{isPlanB ? t.planB : t.planA}{isPlanB && trigger ? ` · ${hhmm(trigger.issued_at)}` : ""}</Badge>
            </View>
            {!online && <Txt k="smallStrong" c="sub">{t.offline}</Txt>}
            <Txt k="label" c="sub">{escalating ? t.escalateTitle : `${t.next}${step > 0 ? ` · ${t.option} ${step + 1} ${t.of} ${steps.length}` : ""}`}</Txt>
            <Txt k="headline">{escalating ? plan.escalate_text_localised : st.text_localised}</Txt>
            {!escalating && notEn && <Txt k="small" c="sub">{st.action}</Txt>}
          </View>
          {!escalating && (
            <View style={s.gutter}>
              <MainCard st={st} t={t} isPlanB={isPlanB} trigger={trigger} />
            </View>
          )}
        </Band>

        <View style={[s.gutter, { gap: 16, marginTop: 16 }]}>
          {plan.needs_human && <Notice>{t.needsHuman}</Notice>}
          {!exact && <Notice tone="ink">{t.closestPlan}</Notice>}

          {escalating ? (
            <Card>
              <Txt k="big">{t.showVolunteer}</Txt>
              {notEn && <Txt c="sub">Go to the nearest info tent or show this screen to any volunteer.</Txt>}
              <Txt>Name: {bundle.profile.name} · ID {bundle.profile.id}</Txt>
              <Txt>Planned exit: {name(plan.gate_id)} → {plan.transport.line} {plan.transport.depart ?? ""}</Txt>
            </Card>
          ) : (
            <>
              {/* Fixed fields from the data, never free-translated; English so a volunteer can read them. */}
              <Card style={{ gap: 0, paddingVertical: 6 }}>
                <Detail label={t.gate} value={name(st.gate_id)} first />
                <Detail label={t.route} value={name(st.route_id)} />
                <Detail label={t[st.transport.mode]} value={transportLine(st, t, name)} time={st.transport.depart} />
                {st.wait_at && <Detail label={t.wait} value={name(st.wait_at)} time={st.wait_until} />}
                {st.group_meetup && bundle.profile.group && <Detail label={t.meet} value={name(st.group_meetup)} />}
              </Card>

              <Card>
                <Txt k="headline">Map</Txt>
                <RouteMap bundle={bundle} st={st} scenarioKey={scenarioKey} />
              </Card>

              {st.volunteer_escort && <Notice tone="ink">{t.volunteer}</Notice>}
              {st.notify_contact && <Notice tone="ink">{t.contactNotified}</Notice>}

              <Card>
                <Txt k="headline">{t.why}</Txt>
                <Txt>{st.reason_localised}</Txt>
                {notEn && <Txt k="small" c="sub">{st.reason}</Txt>}
                <Txt k="small" c="sub">{t.source}: {plan.source}</Txt>
              </Card>
            </>
          )}
        </View>
      </ScrollView>

      <View style={[s.shadow, { padding: 16, paddingTop: 12, gap: 2, backgroundColor: p.card, borderTopLeftRadius: 22, borderTopRightRadius: 22 }]}>
        {!escalating && <Btn title={t.notWork} onPress={() => setStep(step + 1)} />}
        {step > 0 && <Btn kind="ghost" title={t.backToFirst} onPress={() => setStep(0)} />}
      </View>
    </View>
  );
}

function Detail({ label, value, time, first }: { label: string; value: string; time?: string | null; first?: boolean }) {
  const p = usePal();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: first ? 0 : 1, borderTopColor: p.line, paddingVertical: 14 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt k="label" c="sub">{label}</Txt>
        <Txt k="bodyStrong">{value}</Txt>
      </View>
      {time ? <Txt k="headline">{time}</Txt> : null}
    </View>
  );
}
