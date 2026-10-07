// Attendee experience: one screen that answers "what do I need to do now?".
// Order: what changed → when to leave → the journey (gate → transport) → start route (map) → why → other options.
// Works offline once loaded: plans, map and trigger key are saved on the phone.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, Vibration, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { describePart, parseScenario, pickCachedScenario, type ScenarioPart } from "../../lib/scenario";
import { verifyTrigger, type Trigger } from "../../lib/trigger";
import { strings } from "../../lib/i18n";
import SiteMap from "./SiteMap";
import { crowdAwarePlan, normalizeBundle, resolveZone, supportedZones, type Bundle, type Plan, type Step } from "./participant-model";
import { normalizeCrowd, type CrowdState } from "../../lib/crowd-model";
import Signup from "./Signup";
import { ATTENDEE, PLANB, F, addMin, getJSON, hhmm, s, store } from "./theme";
import { Btn, Card, Check, Chips, Field, Notice, PalContext, Rule, Txt, usePal } from "./ui";

// Types, safe bundle loading and crowd-aware re-ranking live in participant-model.ts (offline-safe, tested).
// Short, attendee-facing labels for what changed (organizers see the full detail).
function shortPart(x: ScenarioPart): string {
  switch (x.type) {
    case "STORM": return "Storm";
    case "GATE_CLOSED": return `Gate ${x.gate} closed`;
    case "TRAIN_DELAY": return describePart(x).replace(" line", "");
    case "SHUTTLE_FULL": return "Shuttle full";
    case "HEAT": return "Extreme heat";
    case "SET_DELAY": return describePart(x).replace("running ", "");
  }
}

const HEROES = [
  { id: "mei_19", name: "Mei", desc: "19 · reads Mandarin · train home" },
  { id: "tom_70", name: "Tom", desc: "70 · wheelchair · booked shuttle" },
  { id: "jake_16", name: "Jake", desc: "16 · first festival · parent pickup" },
];

export default function Participant({ server, onServer, onPlanB }: { server: string; onServer: (v: string) => void; onPlanB: (on: boolean) => void }) {
  const [ready, setReady] = useState(false);
  const [personId, setPersonId] = useState<string | null>(null);
  const [signingUp, setSigningUp] = useState(false);
  useEffect(() => {
    store.get<string>("planb:person").then((p) => {
      if (p) setPersonId(p);
      setReady(true);
    });
  }, []);
  const choose = (id: string | null) => {
    setPersonId(id);
    onPlanB(false);
    if (id) store.set("planb:person", id);
    else AsyncStorage.removeItem("planb:person");
  };
  if (!ready) return null;
  if (signingUp) return <Signup server={server} onCancel={() => setSigningUp(false)} onDone={(id) => { setSigningUp(false); choose(id); }} />;
  return personId ? <PersonApp server={server} personId={personId} onSwitch={() => choose(null)} onPlanB={onPlanB} /> : <PickScreen server={server} onServer={onServer} onPick={choose} onSignup={() => setSigningUp(true)} />;
}

// ---------- demo: whose phone is this? ----------
function PickScreen({ server, onServer, onPick, onSignup }: { server: string; onServer: (v: string) => void; onPick: (id: string) => void; onSignup: () => void }) {
  const p = usePal();
  const [other, setOther] = useState("");
  const [status, setStatus] = useState<"checking" | "ok" | "fail">("checking");
  useEffect(() => {
    getJSON(`${server}/api/trigger`).then(() => setStatus("ok"), () => setStatus("fail"));
  }, [server]);

  return (
    <ScrollView style={{ backgroundColor: p.bg }} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <View style={{ backgroundColor: p.band, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 32, gap: 8 }}>
        <Txt k="eyebrow" c="sub">Fieldday · Riverside</Txt>
        <Txt k="title">Your journey home is covered by Plan B.</Txt>
        <Txt c="sub">{"Shown here as it would appear inside the event's own app. Nobody installs anything extra."}</Txt>
      </View>
      <View style={{ padding: 20, gap: 14 }}>
        <Txt k="eyebrow" c="sub">Demo · open an attendee</Txt>
        <Card style={{ padding: 0, gap: 0 }}>
          {HEROES.map((h, i) => (
            <Pressable key={h.id} onPress={() => onPick(h.id)} style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 14, padding: 18, borderTopWidth: i ? 1 : 0, borderTopColor: p.line }, pressed && s.pressed]}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: p.band, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontFamily: F.displayBold, fontSize: 18, color: p.ink }}>{h.name[0]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Txt k="big">{h.name}</Txt>
                <Txt k="small" c="sub">{h.desc}</Txt>
              </View>
              <Txt k="headline" c="sub">›</Txt>
            </Pressable>
          ))}
        </Card>
        <Btn kind="line" title="Try ticket checkout (3 questions)" onPress={onSignup} />
        <View style={[s.row, { marginTop: 8 }]}>
          <Field value={other} onChangeText={setOther} placeholder="Attendee ID" autoCapitalize="none" style={{ flex: 1 }} />
          <Btn kind="line" title="Open" onPress={() => other.trim() && onPick(other.trim())} style={{ minHeight: 48 }} />
        </View>
        <View style={{ gap: 6, marginTop: 16 }}>
          <Txt k="small" c="sub">Plan B server</Txt>
          <Field value={server} onChangeText={onServer} autoCapitalize="none" autoCorrect={false} />
          <Txt k="small" c={status === "ok" ? "ok" : status === "fail" ? "danger" : "sub"}>
            {status === "ok" ? "✓ Connected" : status === "fail" ? "Can't connect. Is the laptop server running, on the same Wi-Fi?" : "Checking…"}
          </Txt>
        </View>
      </View>
    </ScrollView>
  );
}

// ---------- one attendee: data (bundle, live updates) ----------
function PersonApp({ server, personId, onSwitch, onPlanB }: { server: string; personId: string; onSwitch: () => void; onPlanB: (on: boolean) => void }) {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [crowd, setCrowd] = useState<CrowdState>({});
  const [zone, setZone] = useState("");
  const [online, setOnline] = useState(true);
  const [error, setError] = useState("");
  const lastRaw = useRef<string | null>(null);

  // Saved copy first (instant, offline), then refresh. A broken server response never overwrites a working saved plan.
  const refreshBundle = useCallback(async () => {
    try {
      const b = normalizeBundle(await getJSON<unknown>(`${server}/api/bundle/${personId}`, 5000), personId);
      if (!b) throw new Error("invalid bundle");
      await store.set(`planb:bundle:${personId}`, b);
      setBundle(b);
      setError("");
    } catch {
      const saved = normalizeBundle(await store.get<unknown>(`planb:bundle:${personId}`), personId);
      if (!saved) setError("Your plan isn't on this phone yet. Open it once with signal.");
    }
  }, [server, personId]);

  useEffect(() => {
    (async () => {
      const [saved, t, savedCrowd, savedZone] = await Promise.all([
        store.get<unknown>(`planb:bundle:${personId}`),
        store.get<Trigger>("planb:trigger"),
        store.get<unknown>("planb:crowd"),
        store.get<string>(`planb:zone:${personId}`),
      ]);
      const cached = normalizeBundle(saved, personId);
      if (cached) setBundle(cached);
      if (t) { setTrigger(t); lastRaw.current = t.raw; }
      setCrowd(normalizeCrowd(savedCrowd));
      if (typeof savedZone === "string") setZone(savedZone);
      refreshBundle();
    })();
    const id = setInterval(refreshBundle, 30000);
    return () => clearInterval(id);
  }, [personId, refreshBundle]);

  // Updates from Fieldday (simulated push / SMS link) plus live path reports. Need some signal;
  // the trigger is verified on the phone with the cached public key.
  useEffect(() => {
    if (!bundle) return;
    const poll = async () => {
      try {
        const { trigger: raw, crowd: live } = await getJSON<{ trigger: string | null; crowd?: unknown }>(`${server}/api/trigger`, 2500);
        setOnline(true);
        if (live) {
          setCrowd(normalizeCrowd(live));
          store.set("planb:crowd", live);
        }
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
    const base = bundle.plans[key] ?? bundle.plans.NORMAL;
    if (!base) return null;
    // Re-rank the saved options for where the attendee is now and any path an organizer marked busy/closed.
    const here = resolveZone(bundle, base, zone);
    const ranked = crowdAwarePlan(base, crowd, bundle.walking, here, bundle.closed?.[key]);
    return {
      plan: ranked.plan, key, exact: exact || code === "NORMAL", isPlanB: code !== "NORMAL",
      zone: here, zones: supportedZones(bundle, base), unavailable: ranked.unavailable, rerouted: ranked.fromRoute,
    };
  }, [bundle, trigger, crowd, zone]);

  useEffect(() => onPlanB(!!current?.isPlanB), [current?.isPlanB, onPlanB]);

  if (!bundle || !current?.plan)
    return (
      <View style={{ padding: 24, gap: 16 }}>
        <Txt k="headline">{error || (bundle ? "Your plan is still being prepared." : "Loading your plan…")}</Txt>
        <Btn kind="ghost" title="Choose someone else" onPress={onSwitch} />
      </View>
    );

  return (
    <PalContext.Provider value={current.isPlanB ? PLANB : ATTENDEE}>
      <AttendeeScreen
        // A new update, a new starting point or a re-ranked route starts again from option 1.
        key={JSON.stringify([trigger?.raw, current.zone, current.unavailable, current.plan.route_id, current.plan.transport.ref_id])}
        bundle={bundle}
        plan={current.plan}
        scenarioKey={current.key}
        isPlanB={current.isPlanB}
        exact={current.exact}
        trigger={trigger}
        online={online}
        crowd={crowd}
        zone={current.zone}
        zones={current.zones}
        unavailable={current.unavailable}
        reroutedFrom={current.rerouted}
        onZone={(z) => { setZone(z); store.set(`planb:zone:${personId}`, z); }}
        onSwitch={onSwitch}
      />
    </PalContext.Provider>
  );
}

// ---------- the one attendee screen ----------
function AttendeeScreen({ bundle, plan, scenarioKey, isPlanB, exact, trigger, online, crowd, zone, zones, unavailable, reroutedFrom, onZone, onSwitch }: {
  bundle: Bundle; plan: Plan; scenarioKey: string; isPlanB: boolean; exact: boolean; trigger: Trigger | null; online: boolean;
  crowd: CrowdState; zone: string; zones: string[]; unavailable: boolean; reroutedFrom: string | null; onZone: (z: string) => void; onSwitch: () => void;
}) {
  const p = usePal();
  const t = strings(bundle.profile.lang);
  const [step, setStep] = useState(unavailable ? 1 + plan.alternatives.length : 0); // 0 = plan, 1..n = alternatives, n+1 = get help
  const [pickZone, setPickZone] = useState(false);
  const [showRoute, setShowRoute] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const name = (id: string | null | undefined) => (id ? bundle.names[id] ?? id.replace(/_/g, " ") : "");
  const steps: Step[] = [plan, ...plan.alternatives];
  const escalating = step >= steps.length;
  const st = steps[Math.min(step, steps.length - 1)];
  const notEn = bundle.profile.lang !== "en";
  const closed = bundle.closed?.[scenarioKey];

  // Journey facts, from the venue data saved on the phone.
  const dest = st.transport.mode === "train" ? "flinders_st" : st.transport.platform;
  const routeLeg = bundle.walking?.routes[st.route_id];
  const connLeg = bundle.walking?.connections[`${st.gate_id}>${dest}`];
  const pathLevel = crowd[st.route_id]?.level;
  const walk = routeLeg && connLeg ? routeLeg.walk_min + connLeg.walk_min : null;
  const covered = !!routeLeg?.covered && !!connLeg?.covered;
  const stepFree = !!routeLeg?.step_free && !!connLeg?.step_free;
  const leave = st.wait_until ?? closed?.leave ?? "22:30";
  const atStop = walk !== null ? addMin(leave, walk) : st.arrive;
  const gate = st.gate_id.replace("gate_", "");
  const kind = bundle.service_kinds?.[st.transport.ref_id];
  const booked = bundle.profile.home.booking ?? bundle.profile.home.zone;
  const changeLine = (parseScenario(scenarioKey) ?? []).map(shortPart).join(" · ");

  const transportTitle =
    st.transport.mode === "train" ? `${st.transport.line} line · ${t.platform} ${st.transport.platform}`
    : st.transport.mode === "pickup" ? `${t.pickupAt} ${name(st.transport.ref_id).replace(/ \(.*/, "")}`
    : name(st.transport.ref_id).replace(/ \(.*/, "") || st.transport.line;
  const transportLabel = st.transport.mode === "train" ? t.takeTrain : t[st.transport.mode];

  return (
    <ScrollView style={{ backgroundColor: p.bg }} contentContainerStyle={{ paddingBottom: 48 }}>
      {/* 1. What changed */}
      <View style={{ backgroundColor: p.band, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 28, gap: 6 }}>
        <View style={s.between}>
          <Txt k="eyebrow" c={isPlanB ? "accent" : "sub"}>{isPlanB ? `Plan B${trigger ? ` · ${hhmm(trigger.issued_at)}` : ""}` : "Plan A · Tonight"}</Txt>
          <Txt k="small" c="sub">{online ? "" : "✈︎ Offline · saved on this phone"}</Txt>
        </View>
        <Txt k="title">{isPlanB ? t.wayHomeChanged : t.wayHomeTonight}</Txt>
        <Txt c="sub">{isPlanB ? changeLine : `${bundle.profile.name} · ${t.festivalDay}`}</Txt>
      </View>

      <View style={{ paddingHorizontal: 20, paddingTop: 24, gap: 22 }}>
        {plan.needs_human && <Notice>{t.needsHuman}</Notice>}
        {!exact && <Notice tone="ink">{t.closestPlan}</Notice>}

        {escalating ? (
          <View style={{ gap: 14 }}>
            <Txt k="eyebrow" c="sub">{t.escalateTitle}</Txt>
            <Txt k="title">{plan.escalate_text_localised}</Txt>
            {notEn && <Txt c="sub">Go to the nearest info tent or show this screen to any volunteer.</Txt>}
            <Card>
              <Txt k="bodyStrong">{t.showVolunteer}</Txt>
              <Txt>{bundle.profile.name} · ID {bundle.profile.id}</Txt>
              <Txt c="sub">Planned: Gate {plan.gate_id.replace("gate_", "")} → {plan.transport.line} {plan.transport.depart ?? ""}</Txt>
            </Card>
            <Btn kind="ghost" title={t.backToFirst} onPress={() => setStep(0)} />
          </View>
        ) : (
          <>
            {/* 2. What to do now */}
            <View style={{ gap: 4 }}>
              <Txt k="eyebrow" c="sub">{step > 0 ? `${t.option} ${step + 1} ${t.of} ${steps.length}` : isPlanB ? t.leaveAt : t.bestTime}</Txt>
              <Txt k="mega">{leave}</Txt>
              {st.wait_until && st.wait_at ? <Txt k="bodyStrong">{t.waitAtUntil}: {name(st.wait_at)}</Txt> : null}
              {!isPlanB && st.wait_until ? <Txt c="sub">{t.waveNote}</Txt> : null}
              <Txt style={{ marginTop: 10 }}>{st.text_localised}</Txt>
            </View>

            {/* Where they're starting from (if they moved), and any re-route because a path got busy */}
            {zones.length > 1 && step === 0 && (
              <View style={{ gap: 8, marginBottom: -8 }}>
                <Pressable onPress={() => setPickZone(!pickZone)} style={({ pressed }) => [s.between, { minHeight: 36 }, pressed && s.pressed]}>
                  <Txt k="small" c="sub">Starting from {name(zone)}</Txt>
                  <Txt k="smallStrong" c="accent">{pickZone ? "Done" : "Change"}</Txt>
                </Pressable>
                {pickZone && (
                  <Chips options={zones.map((z) => [z, name(z)])} value={zone} onChange={(z) => { onZone(z); setPickZone(false); }} />
                )}
              </View>
            )}
            {step === 0 && reroutedFrom && (
              <Notice tone="ink">Path busy: switched from {name(reroutedFrom).replace(/ \(.*/, "")} to {name(st.route_id).replace(/ \(.*/, "")}.</Notice>
            )}

            {/* 3. The journey, once */}
            <Card style={{ gap: 0, padding: 0 }}>
              <View style={[s.row, { padding: 20 }]}>
                <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: p.ink, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontFamily: F.displayBold, fontSize: 30, color: "#FFFFFF" }}>{gate}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Txt k="headline">{t.gate} {gate}</Txt>
                  {walk !== null && (
                    <Txt k="small" c="sub">
                      {walk} {t.minWalk}{covered ? ` · ${t.coveredWord}` : ""}{stepFree ? ` · ${t.stepFreeWord}` : ""}{pathLevel === "heavy" ? " · busy path" : pathLevel === "moderate" ? " · some crowding" : ""}
                    </Txt>
                  )}
                </View>
              </View>
              <Text style={{ fontFamily: F.body, fontSize: 18, color: p.sub, marginLeft: 44, marginTop: -10, marginBottom: -6 }}>↓</Text>
              <View style={[s.row, { padding: 20, paddingTop: 12 }]}>
                <View style={{ flex: 1 }}>
                  <Txt k="small" c="sub">{transportLabel}</Txt>
                  <Txt k="big">{transportTitle}</Txt>
                </View>
                {st.transport.depart ? <Txt k="huge">{st.transport.depart}</Txt> : null}
              </View>
              {(st.transport.depart && atStop) || (st.group_meetup && bundle.profile.group) || st.volunteer_escort || st.notify_contact ? (
                <View style={{ backgroundColor: p.soft, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, paddingHorizontal: 20, paddingVertical: 14, gap: 4 }}>
                  {st.transport.depart && atStop ? <Txt k="small">{t.beThereBy} {atStop}</Txt> : null}
                  {st.group_meetup && bundle.profile.group ? <Txt k="small">{t.ifSeparated}: {name(st.group_meetup)}</Txt> : null}
                  {st.volunteer_escort ? <Txt k="small">{t.volunteerShort}</Txt> : null}
                  {st.notify_contact ? <Txt k="small">{t.contactNotified}</Txt> : null}
                </View>
              ) : null}
            </Card>

            <Btn title={showRoute ? t.hideRoute : t.startRoute} onPress={() => setShowRoute(!showRoute)} />
            {showRoute && bundle.map && (
              <View style={{ borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: p.line }}>
                <SiteMap
                  map={bundle.map}
                  closedGates={closed?.gates}
                  closedPlaces={closed?.places}
                  storm={closed?.storm}
                  highlight={{ route_id: st.route_id, gate_id: st.gate_id, dest_id: dest, meetup_id: bundle.profile.group ? st.group_meetup : null }}
                />
              </View>
            )}

            {/* 4. Why, and other options */}
            <View style={{ gap: 12 }}>
              <Pressable onPress={() => setShowWhy(!showWhy)} style={({ pressed }) => [s.between, { minHeight: 44 }, pressed && s.pressed]}>
                <Txt k="bodyStrong">{t.whyPlan}</Txt>
                <Txt k="headline" c="sub">{showWhy ? "−" : "→"}</Txt>
              </Pressable>
              {showWhy && (
                <View style={{ gap: 8 }}>
                  {stepFree && <Check>{t.ckStepFree}</Check>}
                  {covered && <Check>{t.ckCovered}</Check>}
                  {(closed?.gates ?? []).filter((g) => g !== st.gate_id).map((g) => (
                    <Check key={g}>{t.ckAvoids} {t.gate} {g.replace("gate_", "")}</Check>
                  ))}
                  {(kind === "accessible" || kind === "accessible_taxi") && <Check>{t.ckAccessible}</Check>}
                  {booked && st.transport.ref_id === booked && <Check>{t.ckKeeps}</Check>}
                  {st.wait_until && <Check>{t.ckCrowd}</Check>}
                  <Txt c="sub" style={{ marginTop: 4 }}>{st.reason_localised}</Txt>
                  {notEn && <Txt k="small" c="sub">{st.action}. {st.reason}</Txt>}
                  {plan.journey?.main_tradeoff && step === 0 ? <Txt k="small" c="sub">{plan.journey.main_tradeoff}</Txt> : null}
                  <Btn kind="ghost" title={showDetails ? "Hide details" : t.details} onPress={() => setShowDetails(!showDetails)} style={{ alignSelf: "flex-start" }} />
                  {showDetails && (
                    <Txt k="small" c="sub">
                      {plan.source}{plan.weather ? ` · Forecast: ${plan.weather.source}${plan.weather.status !== "available" ? " (unavailable)" : ""}` : ""}{plan.approved_by ? ` · Approved by ${plan.approved_by}` : ""}
                    </Txt>
                  )}
                </View>
              )}
              <Rule />
              <Btn kind="line" title={t.otherOption} onPress={() => { setStep(step + 1); setShowRoute(false); setShowWhy(false); }} />
              {step > 0 && <Btn kind="ghost" title={t.backToFirst} onPress={() => setStep(0)} />}
            </View>
          </>
        )}

        <Btn kind="ghost" title="Switch attendee (demo)" onPress={onSwitch} />
      </View>
    </ScrollView>
  );
}
