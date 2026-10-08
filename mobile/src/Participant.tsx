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
import { crowdAwarePlan, normalizeBundle, resolveZone, supportedZones, type Bundle, type LineupSet, type Plan, type Step } from "./participant-model";
import { normalizeCrowd, type CrowdState } from "../../lib/crowd-model";
import Signup from "./Signup";
import { EditContact } from "./ContactForm";
import { Banner, NoteCard, useDemoInbox, type DemoNote } from "./Notify";
import { ATTENDEE, PLANB, C, F, addMin, getJSON, hhmm, s, store } from "./theme";
import { Btn, Card, Check, Chips, Dot, Field, InnerPill, Notice, PalContext, Tile, Txt, onTile, usePal } from "./ui";

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

// Minutes from the phone's clock to an HH:MM leaving time (copes with after-midnight times).
// Only used when it's close (within 2 hours), so a daytime demo still shows the plain time.
function minsUntil(time: string, now: Date): number | null {
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  let d = (h % 24) * 60 + m - (now.getHours() * 60 + now.getMinutes());
  if (d < -12 * 60) d += 24 * 60;
  return d >= -15 && d <= 120 ? d : null;
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
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: [C.green, C.pink, C.yellow][i], alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontFamily: F.displayBold, fontSize: 18, color: i === 2 ? C.ink : C.white }}>{h.name[0]}</Text>
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
  // Demo notifications (simulated) for this attendee only, plus any schedule changes.
  const { notes, setDelays, incoming, clearIncoming } = useDemoInbox(server, personId, "attendee");
  const [opened, setOpened] = useState<DemoNote | null>(null);
  const [editing, setEditing] = useState(false);

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

  if (editing) return <EditContact server={server} personId={personId} onClose={() => setEditing(false)} />;
  return (
    <View style={{ flex: 1 }}>
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
        notes={notes}
        setDelays={setDelays}
        opened={opened}
        onOpen={setOpened}
        onEditContact={() => setEditing(true)}
      />
    </PalContext.Provider>
    {incoming && <Banner key={incoming.id} note={incoming} onOpen={() => setOpened(incoming)} onDone={clearIncoming} />}
    </View>
  );
}

// ---------- the one attendee screen ----------
function AttendeeScreen({ bundle, plan, scenarioKey, isPlanB, exact, trigger, online, crowd, zone, zones, unavailable, reroutedFrom, onZone, onSwitch, notes, setDelays, opened, onOpen, onEditContact }: {
  bundle: Bundle; plan: Plan; scenarioKey: string; isPlanB: boolean; exact: boolean; trigger: Trigger | null; online: boolean;
  crowd: CrowdState; zone: string; zones: string[]; unavailable: boolean; reroutedFrom: string | null; onZone: (z: string) => void; onSwitch: () => void;
  notes: DemoNote[]; setDelays: Record<string, number>; opened: DemoNote | null; onOpen: (n: DemoNote | null) => void; onEditContact: () => void;
}) {
  const p = usePal();
  const t = strings(bundle.profile.lang);
  const [step, setStep] = useState(unavailable ? 1 + plan.alternatives.length : 0); // 0 = plan, 1..n = alternatives, n+1 = get help
  const [pickZone, setPickZone] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [now, setNow] = useState(() => new Date());
  // The hero's arrow scrolls down to the journey tiles (gate → ride).
  const scroller = useRef<ScrollView>(null);
  const sheetY = useRef(0);
  const journeyY = useRef(0);
  const openedY = useRef(0);
  const [showInbox, setShowInbox] = useState(false);
  // Opening a notification: congestion → back to the map (new route); schedule/artist → the panel explaining it.
  useEffect(() => {
    if (!opened) return;
    const id = setTimeout(() => scroller.current?.scrollTo({ y: opened.action.kind === "route" ? 0 : Math.max(0, sheetY.current + openedY.current - 16), animated: true }), 120);
    return () => clearTimeout(id);
  }, [opened]);
  const showJourney = () => scroller.current?.scrollTo({ y: Math.max(0, sheetY.current + journeyY.current - 16), animated: true });
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 20000);
    return () => clearInterval(id);
  }, []);
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
  // Only worth saying to people who asked for step-free routes (wheelchair, pram, mobility needs).
  const needsStepFree = bundle.profile.access.step_free || bundle.profile.access.wheelchair;
  const stepFree = needsStepFree && !!routeLeg?.step_free && !!connLeg?.step_free;
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
  const transportLabel =
    st.transport.mode === "train" ? t.takeTrain
    : kind === "accessible_taxi" && !notEn ? "Accessible taxi"
    : kind === "accessible" && !notEn ? "Accessible shuttle"
    : t[st.transport.mode];
  const countdown = minsUntil(leave, now);

  const transportGlyph = "↗";
  const rideTitle = st.transport.mode === "pickup" ? name(st.transport.ref_id).replace(/ \(.*/, "") : st.transport.depart ? transportTitle.replace(` ${st.transport.depart}`, "") : transportTitle;
  const onHero = C.white;

  return (
    <ScrollView ref={scroller} style={{ backgroundColor: p.bg }} contentContainerStyle={{ paddingBottom: 48, flexGrow: 1 }}>
      {/* Map across the top, with the route highlighted; the white sheet slides over it */}
      {bundle.map && !escalating ? (
        <SiteMap
          map={bundle.map}
          closedGates={closed?.gates}
          closedPlaces={closed?.places}
          storm={closed?.storm}
          highlight={{ route_id: st.route_id, gate_id: st.gate_id, dest_id: dest, meetup_id: bundle.profile.group ? st.group_meetup : null }}
          accent={p.accent}
        />
      ) : null}

      <View onLayout={(e) => { sheetY.current = e.nativeEvent.layout.y; }} style={{ flexGrow: 1, backgroundColor: p.card, borderTopLeftRadius: 36, borderTopRightRadius: 36, marginTop: bundle.map && !escalating ? -36 : 8, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 24, gap: 18 }}>
        <View style={{ alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: p.line }} />

        {/* 1. What changed */}
        <View style={{ gap: 6 }}>
          <View style={s.between}>
            <View style={{ alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: isPlanB ? C.pink : p.raised }}>
              <Txt k="eyebrow" style={{ color: isPlanB ? C.white : p.ink }}>{isPlanB ? `Plan B${trigger ? ` · ${hhmm(trigger.issued_at)}` : ""}` : t.festivalDay}</Txt>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {!online && <Txt k="small" c="sub">Offline</Txt>}
              <Pressable accessibilityRole="button" accessibilityLabel={`Alerts, ${notes.length}`} onPress={() => setShowInbox(!showInbox)} style={({ pressed }) => [{ minHeight: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: showInbox ? p.accent : p.raised, flexDirection: "row", alignItems: "center", gap: 6 }, pressed && s.pressed]}>
                <Txt k="smallStrong" style={{ color: showInbox ? C.white : p.ink }}>Alerts</Txt>
                {notes.length > 0 && (
                  <View style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: showInbox ? C.white : C.pink, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontFamily: F.bodyBold, fontSize: 12, color: showInbox ? p.accent : C.white }}>{notes.length}</Text>
                  </View>
                )}
              </Pressable>
            </View>
          </View>
          <Txt k="title">{isPlanB ? t.wayHomeChanged : t.wayHomeTonight}</Txt>
          <Txt c="sub">{isPlanB ? changeLine : t.allNormalSub}</Txt>
        </View>

        {/* Notification centre: every alert this phone has received (demo notifications are simulated) */}
        {showInbox && (
          <View style={{ gap: 8 }}>
            {notes.length === 0 ? <Txt k="small" c="sub">No alerts yet.</Txt> : [...notes].reverse().map((n) => (
              <NoteCard key={n.id} note={n} compact onPress={() => { onOpen(n); setShowInbox(false); }} />
            ))}
          </View>
        )}
        {opened && (
          <View onLayout={(e) => { openedY.current = e.nativeEvent.layout.y; }}>
            <OpenedNote note={opened} bundle={bundle} setDelays={setDelays} routeName={name(st.route_id).replace(/ \(.*/, "")} gate={gate} rerouted={!!reroutedFrom} onClose={() => onOpen(null)} />
          </View>
        )}

        {plan.needs_human && <Notice>{t.needsHuman}</Notice>}
        {!exact && <Notice tone="ink">{t.closestPlan}</Notice>}

        {escalating ? (
          <View style={{ gap: 14 }}>
            <Tile color={C.pink} glyph="!">
              <Txt k="smallStrong" style={{ color: C.white }}>{t.escalateTitle}</Txt>
              <Txt k="title" style={{ color: C.white }}>{plan.escalate_text_localised}</Txt>
            </Tile>
            {notEn && <Txt c="sub">Go to the nearest info tent or show this screen to any volunteer.</Txt>}
            <View style={{ backgroundColor: p.raised, borderRadius: 24, padding: 18, gap: 4 }}>
              <Txt k="bodyStrong">{t.showVolunteer}</Txt>
              <Txt>{bundle.profile.name} · ID {bundle.profile.id}</Txt>
              <Txt c="sub">Planned: Gate {plan.gate_id.replace("gate_", "")} → {plan.transport.line} {plan.transport.depart ?? ""}</Txt>
            </View>
            <Btn kind="ghost" title={t.backToFirst} onPress={() => setStep(0)} />
          </View>
        ) : (
          <>
            {/* 2. Your way home: one solid colour card (green = Plan A, pink = Plan B) */}
            <View style={{ backgroundColor: p.hero, borderRadius: 30, padding: 20, gap: 4 }}>
              <View style={s.between}>
                <Txt k="bodyStrong" style={{ color: onHero, flex: 1 }}>
                  {step > 0 ? `${t.option} ${step + 1} ${t.of} ${steps.length} · ` : ""}
                  {countdown === null ? (isPlanB ? t.leaveAt : t.bestTime) : countdown <= 0 ? t.leaveNow : t.leaveIn}
                </Txt>
                <Pressable accessibilityRole="button" accessibilityLabel="Show the journey" onPress={showJourney} hitSlop={12} style={({ pressed }) => pressed && s.pressed}>
                  <Dot glyph="↓" color={p.hero} size={40} />
                </Pressable>
              </View>
              <Txt k="mega" style={{ color: onHero }}>{countdown !== null && countdown > 0 ? `${countdown} ${t.minShort}` : leave}</Txt>
              {countdown !== null && countdown > 0 ? <Txt k="bodyStrong" style={{ color: onHero }}>{t.atTime} {leave}</Txt> : null}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                {st.wait_until && st.wait_at ? <InnerPill>{t.waitAtUntil}: {name(st.wait_at)}</InnerPill> : null}
                <InnerPill>{t.gate} {gate}{st.transport.depart ? ` · ${transportLabel} ${st.transport.depart}` : ""}</InnerPill>
              </View>
              {!isPlanB && step === 0 ? <Txt k="small" style={{ marginTop: 10, color: onHero }}>{st.wait_until ? t.waveNote : t.normalNote}</Txt> : null}
              <Txt style={{ marginTop: 8, color: onHero }}>{st.text_localised}</Txt>
            </View>

            {/* Where they're starting from (if they moved), and any re-route because a path got busy */}
            {zones.length > 1 && step === 0 && (
              <View style={{ gap: 8, marginVertical: -6 }}>
                <Pressable onPress={() => setPickZone(!pickZone)} style={({ pressed }) => [s.between, { minHeight: 44 }, pressed && s.pressed]}>
                  <Txt k="small" c="sub" style={{ flex: 1 }}>Starting from {name(zone)}</Txt>
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

            {/* 3. The journey as two flat tiles: walk to the gate → ride */}
            <View onLayout={(e) => { journeyY.current = e.nativeEvent.layout.y; }} style={{ flexDirection: "row", gap: 12 }}>
              <Tile color={C.yellow} glyph={gate} style={{ flex: 1, minHeight: 170 }}>
                <Txt k="headline" style={{ color: onTile(C.yellow) }}>{t.gate} {gate}</Txt>
                {walk !== null ? <Txt k="smallStrong" style={{ color: onTile(C.yellow) }}>{walk} {t.minWalk}</Txt> : null}
                {covered ? <Txt k="small" style={{ color: onTile(C.yellow) }}>{t.coveredWord}</Txt> : null}
                {stepFree ? <Txt k="small" style={{ color: onTile(C.yellow) }}>{t.stepFreeWord}</Txt> : null}
                {pathLevel === "heavy" ? <Txt k="smallStrong" style={{ color: onTile(C.yellow) }}>Busy path</Txt> : pathLevel === "moderate" ? <Txt k="smallStrong" style={{ color: onTile(C.yellow) }}>Some crowding</Txt> : null}
              </Tile>
              <Tile color={C.purple} glyph={transportGlyph} style={{ flex: 1.3, minHeight: 170 }}>
                {rideTitle !== transportLabel ? <Txt k="small" style={{ color: C.white }}>{transportLabel}</Txt> : null}
                <Txt k="bodyStrong" style={{ color: C.white }}>{rideTitle}</Txt>
                {st.transport.depart ? <Txt k="huge" style={{ color: C.white }}>{st.transport.depart}</Txt> : null}
              </Tile>
            </View>
            {(st.transport.depart && atStop) || (st.group_meetup && bundle.profile.group) || st.volunteer_escort || st.notify_contact ? (
              <View style={{ backgroundColor: p.raised, borderRadius: 24, paddingHorizontal: 18, paddingVertical: 14, gap: 4 }}>
                {st.transport.depart && atStop ? <Txt k="small">{t.atStop} {atStop}</Txt> : null}
                {st.group_meetup && bundle.profile.group ? <Txt k="small">{t.ifSeparated}: {name(st.group_meetup)}</Txt> : null}
                {st.volunteer_escort ? <Txt k="small">{t.volunteerShort}</Txt> : null}
                {st.notify_contact ? <Txt k="small">{t.contactNotified}</Txt> : null}
              </View>
            ) : null}

            {(bundle.lineup?.length ?? 0) > 0 && <Lineup sets={bundle.lineup!} setDelays={setDelays} focus={opened?.action.kind === "lineup" ? opened.action.set_id : null} />}

            {/* 4. Why, and other options: white pills, below the action */}
            <View style={{ gap: 10 }}>
              <Pill label={t.whyPlan} sign={showWhy ? "−" : "+"} onPress={() => setShowWhy(!showWhy)} />
              {showWhy && (
                <View style={{ backgroundColor: p.raised, borderRadius: 24, padding: 18, gap: 8 }}>
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
                </View>
              )}
              <Pill label={t.otherOption} sign="→" onPress={() => { setStep(step + 1); setShowWhy(false); }} />
              {step > 0 && <Btn kind="ghost" title={t.backToFirst} onPress={() => setStep(0)} style={{ alignSelf: "flex-start" }} />}
            </View>
          </>
        )}

        <Pill label="Emergency & pickup contact" sign="›" onPress={onEditContact} />
        <Btn kind="ghost" title="Switch attendee (demo)" onPress={onSwitch} />
      </View>
    </ScrollView>
  );
}

// Full-width white pill row with a trailing sign (like the travel-mode pills).
function Pill({ label, sign, onPress }: { label: string; sign: string; onPress: () => void }) {
  const p = usePal();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.between, { minHeight: 56, paddingHorizontal: 20, borderRadius: 999, borderWidth: 1, borderColor: p.line, backgroundColor: p.card }, pressed && s.pressed]}>
      <Txt k="bodyStrong">{label}</Txt>
      <Txt k="headline" c="sub">{sign}</Txt>
    </Pressable>
  );
}

// Must-see sets tonight, with any schedule change (demo input) shown as old → new time.
function Lineup({ sets, setDelays, focus }: { sets: LineupSet[]; setDelays: Record<string, number>; focus: string | null }) {
  const p = usePal();
  return (
    <View style={{ backgroundColor: p.raised, borderRadius: 24, padding: 18, gap: 10 }}>
      <Txt k="bodyStrong">Your must-see tonight</Txt>
      {sets.map((x) => {
        const d = setDelays[x.id] ?? 0;
        return (
          <View key={x.id} style={[s.between, focus === x.id && { backgroundColor: p.card, borderRadius: 16, marginHorizontal: -8, paddingHorizontal: 8, paddingVertical: 6 }]}>
            <View style={{ flex: 1 }}>
              <Txt k="smallStrong">{x.artist}</Txt>
              <Txt k="small" c="sub">{x.stage}</Txt>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              {d ? <Txt k="small" c="sub" style={{ textDecorationLine: "line-through" }}>{x.start}</Txt> : null}
              <Txt k="bodyStrong">{d ? addMin(x.start, d) : x.start}–{d ? addMin(x.end, d) : x.end}</Txt>
              {d ? <View style={{ backgroundColor: C.pink, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={{ fontFamily: F.bodyBold, fontSize: 12, color: C.white }}>+{d} min</Text></View> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// What a tapped notification opens: the relevant updated information, on the same screen.
function OpenedNote({ note, bundle, setDelays, routeName, gate, rerouted, onClose }: {
  note: DemoNote; bundle: Bundle; setDelays: Record<string, number>; routeName: string; gate: string; rerouted: boolean; onClose: () => void;
}) {
  const p = usePal();
  const set = note.action.kind === "lineup" ? bundle.lineup?.find((x) => x.id === (note.action as { set_id: string }).set_id) : undefined;
  const d = set ? setDelays[set.id] ?? 0 : 0;
  const color = note.scenario === "congestion" ? C.pink : note.scenario === "delay" ? C.yellow : C.purple;
  const fg = onTile(color);
  return (
    <View style={{ backgroundColor: color, borderRadius: 28, padding: 18, gap: 8 }}>
      <View style={s.between}>
        <Txt k="smallStrong" style={{ color: fg }}>{note.title}</Txt>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={12}><Txt k="bodyStrong" style={{ color: fg }}>✕</Txt></Pressable>
      </View>
      <Txt style={{ color: fg }}>{note.body}</Txt>
      {note.scenario === "congestion" && (
        <InnerPill>{rerouted ? `New route: ${routeName} → Gate ${gate}` : `Still ${routeName}: allow extra time`}</InnerPill>
      )}
      {set && (
        <InnerPill>{set.artist} · {set.stage} · {d ? `${set.start} → ${addMin(set.start, d)}` : set.start}</InnerPill>
      )}
      {note.scenario === "priority" && set && bundle.map && (
        <View style={{ borderRadius: 20, overflow: "hidden", backgroundColor: p.card, marginTop: 4 }}>
          <SiteMap map={bundle.map} highlight={{ route_id: "", gate_id: "", meetup_id: set.stage_id }} meetLabel="Go here" accent={p.accent} />
        </View>
      )}
      <Txt k="small" style={{ color: fg }}>Simulated demo alert.</Txt>
    </View>
  );
}
