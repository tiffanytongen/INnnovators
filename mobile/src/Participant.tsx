// Participant side: whose phone → calm home screen → full plan. Works offline once loaded.
import { useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, Text, TextInput, Vibration, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { pickCachedScenario } from "../../lib/scenario";
import { verifyTrigger, type Trigger } from "../../lib/trigger";
import { strings } from "../../lib/i18n";
import SiteMap from "./SiteMap";
import Signup from "./Signup";
import { C, s, getJSON, store, hhmm } from "./theme";

import { displayTime, normalizeBundle, crowdAwarePlan, supportedZones, resolveZone, type Bundle, type Step, type Plan } from "./participant-model";
import { normalizeCrowd, CROWD_LABELS, type CrowdState } from "../../lib/crowd-model";

type Strings = ReturnType<typeof strings>;


const HEROES = [
  { id: "mei_19", name: "Mei", desc: "19 · reads Mandarin · train home" },
  { id: "tom_70", name: "Tom", desc: "70 · wheelchair · booked shuttle" },
  { id: "jake_16", name: "Jake", desc: "16 · first festival · parent pickup" },
];

export default function Participant({ server, onServer }: { server: string; onServer: (v: string) => void }) {
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
    if (id) store.set("planb:person", id);
    else AsyncStorage.removeItem("planb:person");
  };
  if (!ready) return null;
  if (signingUp) return <Signup server={server} onCancel={() => setSigningUp(false)} onDone={(id) => { setSigningUp(false); choose(id); }} />;
  return personId ? <PersonApp key={`${server}:${personId}`} server={server} personId={personId} onSwitch={() => choose(null)} /> : <PickScreen server={server} onServer={onServer} onPick={choose} onSignup={() => setSigningUp(true)} />;
}

// ---------- demo: choose whose phone this is ----------
function PickScreen({ server, onServer, onPick, onSignup }: { server: string; onServer: (v: string) => void; onPick: (id: string) => void; onSignup: () => void }) {
  const [other, setOther] = useState("");
  const [connection, setConnection] = useState<{ server: string; status: "ok" | "fail" } | null>(null);
  const status = connection?.server === server ? connection.status : "checking";
  useEffect(() => {
    let active = true;
    getJSON(`${server}/api/trigger`).then(
      () => { if (active) setConnection({ server, status: "ok" }); },
      () => { if (active) setConnection({ server, status: "fail" }); },
    );
    return () => { active = false; };
  }, [server]);

  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 14 }}>
      <Text style={s.brand}>Plan B</Text>
      <Text style={[s.muted, { fontSize: 17 }]}>Plan A is your day. Plan B is what happens when it changes.</Text>
      <Pressable onPress={onSignup} style={({ pressed }) => [s.alertCard, { marginTop: 12 }, pressed && s.pressed]}>
        <Text style={s.alertTitle}>✍️ New here? Sign up in 30 seconds</Text>
        <Text style={[s.body, { color: C.text }]}>Tell us how you’re getting home and we’ll make your plan.</Text>
      </Pressable>
      <Text style={[s.sectionLabel, { marginTop: 18 }]}>Or open an existing attendee (demo)</Text>
      {HEROES.map((h) => (
        <Pressable key={h.id} onPress={() => onPick(h.id)} style={({ pressed }) => [s.card, s.row, pressed && s.pressed]}>
          <View style={s.avatar}><Text style={s.avatarText}>{h.name[0]}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>{h.name}</Text>
            <Text style={s.muted}>{h.desc}</Text>
          </View>
          <Text style={s.chevron}>›</Text>
        </Pressable>
      ))}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput value={other} onChangeText={setOther} placeholder="Someone else? Enter their ID" placeholderTextColor="#9A968E" autoCapitalize="none" style={[s.input, { flex: 1 }]} />
        <Pressable onPress={() => other.trim() && onPick(other.trim())} style={s.secondaryButton}>
          <Text style={s.secondaryButtonText}>Open</Text>
        </Pressable>
      </View>
      <View style={{ marginTop: 24, gap: 6 }}>
        <Text style={s.sectionLabel}>Connection to the Plan B server</Text>
        <TextInput value={server} onChangeText={onServer} autoCapitalize="none" autoCorrect={false} style={s.input} />
        <Text style={[s.muted, status === "ok" && { color: C.green }, status === "fail" && { color: C.red }]}>
          {status === "ok" ? "✓ Connected" : status === "fail" ? "✗ Can't connect. Is the laptop server running, on the same Wi-Fi?" : "Checking…"}
        </Text>
      </View>
    </ScrollView>
  );
}

// ---------- one attendee: data + home / plan screens ----------
function PersonApp({ server, personId, onSwitch }: { server: string; personId: string; onSwitch: () => void }) {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [crowd, setCrowd] = useState<CrowdState>({});
  const [currentZone, setCurrentZone] = useState<string>("");
  const [online, setOnline] = useState(true);
  const [view, setView] = useState<"home" | "plan">("home");
  const [error, setError] = useState("");
  const lastRaw = useRef<string | null>(null);

  // Read and validate the offline copy before starting network refreshes.
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const b = normalizeBundle(await getJSON<unknown>(`${server}/api/bundle/${personId}`, 5000), personId);
        if (!b) throw new Error("Invalid bundle");
        if (!active) return;
        setBundle(b);
        setCurrentZone(existing => existing || b.profile.location_at_end);
        setError("");
        await store.set(`planb:bundle:${personId}`, b);
      } catch {
        const saved = normalizeBundle(await store.get<unknown>(`planb:bundle:${personId}`), personId);
        if (active && !saved) setError("Your plan isn't on this phone yet. Open the app once with signal.");
      }
    };
    void (async () => {
      const [saved, t, savedCrowd, savedZone] = await Promise.all([
        store.get<unknown>(`planb:bundle:${personId}`),
        store.get<Trigger>("planb:trigger"),
        store.get<unknown>("planb:crowd"),
        store.get<unknown>(`planb:zone:${personId}`),
      ]);
      if (!active) return;
      const cached = normalizeBundle(saved, personId);
      if (cached) setBundle(cached);
      setCurrentZone(typeof savedZone === "string" ? savedZone : cached?.profile.location_at_end ?? "");
      setCrowd(normalizeCrowd(savedCrowd));
      if (cached && t && typeof t.raw === "string") {
        const verified = verifyTrigger(t.raw, cached.public_key);
        if (verified) { setTrigger(verified); lastRaw.current = verified.raw; }
      }
      await refresh();
    })();
    const id = setInterval(refresh, 30000);
    return () => { active = false; clearInterval(id); };
  }, [personId, server]);

  // Updates from Fieldday (simulated push/SMS). Need some signal; verified on the phone with the cached public key.
  useEffect(() => {
    if (!bundle) return;
    let active = true;
    let pending = false;
    const poll = async () => {
      if (pending) return;
      pending = true;
      try {
        const { trigger: raw, crowd: liveCrowd } = await getJSON<{
          trigger: string | null;
          crowd: CrowdState;
        }>(`${server}/api/trigger`, 2500);

        if (!active) return;
        setOnline(true);

        if (liveCrowd) {
          setCrowd(normalizeCrowd(liveCrowd));
          store.set("planb:crowd", liveCrowd);
        }

        if (typeof raw !== "string" || !raw || raw === lastRaw.current) return;
        const t = verifyTrigger(raw, bundle.public_key);
        if (!t) return; // forged or corrupted: ignore
        lastRaw.current = raw;
        store.set("planb:trigger", t);
        setTrigger(t);
        if (t.code !== "NORMAL") Vibration.vibrate([0, 250, 120, 250]);
      } catch {
        if (active) setOnline(false);
      } finally {
        pending = false;
      }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => { active = false; clearInterval(id); };
  }, [bundle, server]);

  const current = useMemo(() => {
    if (!bundle) return null;
    const code = trigger?.code ?? "NORMAL";
    const { key, exact } = pickCachedScenario(code, Object.keys(bundle.plans));
    const basePlan = bundle.plans[key] ?? bundle.plans.NORMAL;

    if (!basePlan) return null;

    const zone = resolveZone(bundle, basePlan, currentZone);
    const crowdResult = crowdAwarePlan(
      basePlan,
      crowd,
      bundle.walking,
      zone,
      bundle.closed?.[key]
    );

    return {
      plan: crowdResult.plan,
      zone,
      zones: supportedZones(bundle, basePlan),
      unavailable: crowdResult.unavailable,
      key,
      exact: exact || code === "NORMAL",
      isPlanB: code !== "NORMAL",
      crowdChanged: crowdResult.changed,
      crowdFromRoute: crowdResult.fromRoute,
    };
  }, [bundle, trigger, crowd, currentZone]);

  if (!bundle || !current?.plan)
    return (
      <View style={{ padding: 24, gap: 16 }}>
        <Text style={s.h2}>{error || (bundle ? "Your plan is still being prepared." : "Loading your plan…")}</Text>
        <Pressable onPress={onSwitch}><Text style={s.link}>Choose someone else</Text></Pressable>
      </View>
    );

  const t = strings(bundle.profile.lang);
  const name = (id: string | null) => (id ? bundle.names[id] ?? id : "");
  const props = {
    bundle,
    plan: current.plan,
    scenarioKey: current.key,
    isPlanB: current.isPlanB,
    exact: current.exact,
    trigger,
    online,
    t,
    name,
    server,
    crowd,
    crowdChanged: current.crowdChanged,
    crowdFromRoute: current.crowdFromRoute,
    currentZone: current.zone,
    zones: current.zones,
    unavailable: current.unavailable,
    onZoneChange: (zone: string) => {
      setCurrentZone(zone);
      store.set(`planb:zone:${personId}`, zone);
    },
  };

  return view === "home"
    ? <HomeScreen {...props} onOpen={() => setView("plan")} onSwitch={onSwitch} />
    : <PlanScreen key={JSON.stringify([trigger?.raw, current.zone, current.unavailable, [current.plan, ...current.plan.alternatives].map(st => [st.route_id, st.transport.ref_id, st.transport.depart])])} {...props} onBack={() => setView("home")} />; // new update → start from option 1
}

type ScreenProps = {
  bundle: Bundle; plan: Plan; scenarioKey: string; isPlanB: boolean; exact: boolean; trigger: Trigger | null; online: boolean;
  t: Strings;
  name: (id: string | null) => string;
  server: string;
  crowd: CrowdState;
  crowdChanged: boolean;
  crowdFromRoute: string | null;
  currentZone: string;
  zones: string[];
  unavailable: boolean;
  onZoneChange: (zone: string) => void;
};

function RouteMap({ bundle, st, scenarioKey }: { bundle: Bundle; st: Step; scenarioKey: string }) {
  if (!bundle.map) return null;
  const closed = bundle.closed?.[scenarioKey];
  return (
    <View style={{ borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: C.line }}>
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

// ---------- HOME: calm overview, plan one tap away ----------
function HomeScreen({
  bundle,
  plan,
  scenarioKey,
  isPlanB,
  trigger,
  online,
  t,
  name,
  server,
  currentZone,
  onZoneChange,
  zones,
  unavailable,
  onOpen,
  onSwitch,
}: ScreenProps & { onOpen: () => void; onSwitch: () => void }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 32 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <View>
          <Text style={s.hello}>{t.hi} {bundle.profile.name} 👋</Text>
          <Text style={s.muted}>{t.festivalDay}</Text>
        </View>
        <View style={[s.signalPill, !online && { backgroundColor: "#EDEBE6" }]}>
          <Text style={[s.signalPillText, !online && { color: C.text }]}>{online ? "● Online" : "✈︎ Offline"}</Text>
        </View>
      </View>

      {/* Status */}
      {unavailable ? (
        <Text style={s.redBox}>No supported open route is available from this location. Go to the nearest info tent or ask a volunteer.</Text>
      ) : isPlanB ? (
        <Pressable onPress={onOpen} style={({ pressed }) => [s.alertCard, pressed && s.pressed]}>
          <Text style={s.alertTitle}>⚠︎ {t.changed}{trigger ? ` · ${hhmm(trigger.issued_at)}` : ""}</Text>
          <Text style={s.alertBody}>{plan.text_localised}</Text>
          <Text style={s.alertCta}>{t.tapForNext} ›</Text>
        </Pressable>
      ) : (
        <View style={[s.card, { backgroundColor: C.greenBg, borderColor: "#CFEBD8" }]}>
          <Text style={[s.cardTitle, { color: C.green }]}>✓ {t.allNormal}</Text>
          <Text style={s.muted}>{t.allNormalSub}</Text>
        </View>
      )}


      {/* Current location */}
      <View style={[s.card, { gap: 10 }]}>
        <Text style={s.sectionLabel}>Where are you now?</Text>

        <Text style={s.muted}>
          Update this if you moved to another stage. Your walking route will
          adjust from here.
        </Text>

        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {zones.map((id) => {
            const zone = { id, label: name(id) };
            const active = currentZone === zone.id;

            return (
              <Pressable
                key={zone.id}
                onPress={() => onZoneChange(zone.id)}
                style={[
                  s.tag,
                  {
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    backgroundColor: active ? C.text : C.bg,
                    borderWidth: 1,
                    borderColor: active ? C.text : C.line,
                  },
                ]}
              >
                <Text
                  style={{
                    color: active ? "#fff" : C.text,
                    fontWeight: "700",
                  }}
                >
                  {zone.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Way home */}
      {!unavailable && <Pressable onPress={onOpen} style={({ pressed }) => [s.card, pressed && s.pressed]}>
        <Text style={s.sectionLabel}>{t.wayHome}</Text>
        <View style={[s.row, { marginTop: 10 }]}>
          <View style={s.gateBadge}><Text style={s.gateLetter}>{plan.gate_id.replace("gate_", "")}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>{name(plan.gate_id)}</Text>
            <Text style={s.body}>{transportLine(plan, t, name)}</Text>
          </View>
          {plan.transport.depart ? <Text style={s.time}>{plan.transport.depart}</Text> : null}
        </View>
        <View style={{ marginTop: 12 }}><RouteMap bundle={bundle} st={plan} scenarioKey={scenarioKey} /></View>
        <Text style={[s.link, { marginTop: 12 }]}>{t.seePlan} ›</Text>
      </Pressable>}

      {/* Meet-up */}
      {plan.group_meetup && bundle.profile.group && (
        <View style={s.card}>
          <Text style={s.sectionLabel}>{t.ifSeparated}</Text>
          <Text style={[s.cardTitle, { marginTop: 6 }]}>📍 {name(plan.group_meetup)}</Text>
        </View>
      )}

      <Text style={[s.muted, { textAlign: "center", marginTop: 6 }]}>✓ {t.savedOnPhone}</Text>
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 18 }}>
        {online && (
          <Pressable onPress={() => Linking.openURL(`${server}/api/wallpaper/${bundle.profile.id}`)}>
            <Text style={s.smallLink}>{t.wallpaper}</Text>
          </Pressable>
        )}
        <Pressable onPress={onSwitch}><Text style={s.smallLink}>Switch person (demo)</Text></Pressable>
      </View>
    </ScrollView>
  );
}

// ---------- PLAN: one action, key details, why, "doesn't work for me" ----------
function PlanScreen({
  bundle,
  plan,
  scenarioKey,
  isPlanB,
  exact,
  trigger,
  online,
  t,
  name,
  crowd,
  crowdChanged,
  crowdFromRoute,
  currentZone,
  unavailable,
  onBack,
}: ScreenProps & { onBack: () => void }) {
  const [step, setStep] = useState(0);
  const steps: Step[] = [plan, ...plan.alternatives];
  const escalating = unavailable || step >= steps.length;
  const st = steps[Math.min(step, steps.length - 1)];
  const notEn = bundle.profile.lang !== "en";

  return (
    <View style={{ flex: 1 }}>
      <View style={s.topBar}>
        <Pressable onPress={onBack} hitSlop={12}><Text style={s.back}>‹ {t.home}</Text></Pressable>
        <View style={[s.tag, { backgroundColor: isPlanB ? C.alert : C.greenBg }]}>
          <Text style={[s.tagText, { color: isPlanB ? C.text : C.green }]}>{isPlanB ? t.planB : t.planA}{isPlanB && trigger ? ` · ${hhmm(trigger.issued_at)}` : ""}</Text>
        </View>
      </View>
      {!online && <Text style={s.offlineBar}>✈︎ {t.offline}</Text>}

      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 24 }}>
        {plan.needs_human && <Text style={s.redBox}>{t.needsHuman}</Text>}
        {!exact && <Text style={s.noteBox}>{t.closestPlan}</Text>}

        {escalating ? (
          <View style={{ gap: 14 }}>
            <Text style={s.sectionLabel}>{t.escalateTitle}</Text>
            <Text style={s.h1}>{plan.escalate_text_localised}</Text>
            {notEn && <Text style={s.sub}>Go to the nearest info tent or show this screen to any volunteer.</Text>}
            <View style={[s.card, { borderColor: C.text, borderWidth: 2 }]}>
              <Text style={s.cardTitle}>{t.showVolunteer}</Text>
              <Text style={s.body}>Name: {bundle.profile.name} · ID {bundle.profile.id}</Text>
              <Text style={s.body}>Previously planned exit: {name(plan.gate_id)} → {plan.transport.line} {plan.transport.depart ?? ""}</Text>
            </View>
          </View>
        ) : (
          <>
            <View>
              <Text style={s.sectionLabel}>{t.next}{step > 0 ? ` · ${t.option} ${step + 1} ${t.of} ${steps.length}` : ""}</Text>
              <Text style={s.h1}>{st.text_localised}</Text>
              {notEn && <Text style={s.sub}>{st.action}</Text>}
            </View>

            {/* Fixed fields from the data, never free-translated; English so a volunteer can read them. */}
            <View style={[s.card, { gap: 14 }]}>
              <View style={s.row}>
                <View style={s.gateBadge}><Text style={s.gateLetter}>{st.gate_id.replace("gate_", "")}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.muted}>{t.gate}</Text>
                  <Text style={s.cardTitle}>{name(st.gate_id)}</Text>
                  <Text style={s.muted}>{name(st.route_id)}</Text>
                </View>
              </View>
              <Detail label={t[st.transport.mode]} value={transportLine(st, t, name)} time={st.transport.depart} />
              {st.wait_at && <Detail label={t.wait} value={name(st.wait_at)} time={st.wait_until} />}
              {st.group_meetup && bundle.profile.group && <Detail label={t.meet} value={`📍 ${name(st.group_meetup)}`} />}
            </View>

            <WalkingCard
              bundle={bundle}
              st={st}
              name={name}
              crowd={crowd}
              currentZone={currentZone}
            />

            {step === 0 && crowdChanged && crowdFromRoute && (
              <Text style={s.noteBox}>
                ↪ Route updated from {name(crowdFromRoute)} to {name(st.route_id)}
                {" "}for your location and the latest crowd conditions.
              </Text>
            )}

            <RouteMap
              bundle={bundle}
              st={st}
              scenarioKey={scenarioKey}
            />

            {st.volunteer_escort && <Text style={s.badge}>🙋 {t.volunteer}</Text>}
            {st.notify_contact && <Text style={s.badge}>✉︎ {t.contactNotified}</Text>}

            <View>
              <Text style={s.sectionLabel}>{t.why}</Text>
              <Text style={[s.body, { marginTop: 4 }]}>
                {st.reason_localised}
              </Text>
              {notEn && (
                <Text style={[s.muted, { marginTop: 4 }]}>
                  {st.reason}
                </Text>
              )}
            </View>

            <Text style={s.tiny}>
              Updated{" "}
              {isPlanB && trigger
                ? hhmm(trigger.issued_at)
                : displayTime(bundle.plan_updated_at ?? bundle.fetched_at)}
            </Text>

            <Text style={s.tiny}>
              {t.source}: {plan.source}
            </Text>

          </>
        )}
      </ScrollView>
      <View style={s.footer}>
        {!escalating && (
          <Pressable onPress={() => setStep(value => value + 1)} style={({ pressed }) => [s.primaryButton, pressed && s.pressed]}>
            <Text style={s.primaryButtonText}>{t.notWork}</Text>
          </Pressable>
        )}
        {step > 0 && !unavailable && (
          <Pressable onPress={() => setStep(0)}>
            <Text style={[s.link, { textAlign: "center", padding: 6 }]}>{t.backToFirst}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}


function Detail({
  label,
  value,
  time,
}: {
  label: string;
  value: string;
  time?: string | null;
}) {
  return (
    <View
      style={[
        s.row,
        {
          borderTopWidth: 1,
          borderTopColor: C.line,
          paddingTop: 12,
        },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={s.muted}>{label}</Text>
        <Text style={s.cardTitle}>{value}</Text>
      </View>

      {time ? <Text style={s.time}>{time}</Text> : null}
    </View>
  );
}

function WalkingCard({
  bundle,
  st,
  name,
  crowd,
  currentZone,
}: {
  bundle: Bundle;
  st: Step;
  name: (id: string | null) => string;
  crowd: CrowdState;
  currentZone: string;
}) {
  const route = bundle.walking?.routes[st.route_id];

  const destination =
    st.transport.mode === "train"
      ? "flinders_st"
      : st.transport.platform;

  const connection =
    bundle.walking?.connections[`${st.gate_id}>${destination}`];

  if (!route) return null;

  const crowdLevel = crowd[st.route_id]?.level;
  const totalWalk = route.walk_min + (connection?.walk_min ?? 0);

  return (
    <View style={[s.card, { gap: 8 }]}>
      <Text style={s.sectionLabel}>Your walking route</Text>

      <Text style={s.h2}>
        🚶 {totalWalk} min walk{connection ? "" : " to gate (onward time unavailable)"}
      </Text>

      <Text style={s.body}>
        Latest crowd: {crowdLevel ? CROWD_LABELS[crowdLevel] : "Unknown"}
      </Text>
      <Text style={s.tiny}>Crowd updated: {displayTime(crowd[st.route_id]?.updated_at)}</Text>

      <Text style={s.cardTitle}>
        Walk to {name(st.gate_id)}
      </Text>

      <Text style={s.body}>
        From {name(currentZone)}, follow {route.name}.
        Then continue to {name(destination)}.
      </Text>

      <Text style={s.muted}>
        {name(currentZone)}
        {" → "}
        {name(st.gate_id)}
        {" → "}
        {name(destination)}
      </Text>

      {route.covered && connection?.covered && (
        <Text style={s.muted}>☂ Covered route</Text>
      )}

      {route.step_free && connection?.step_free && (
        <Text style={s.muted}>♿ Step-free</Text>
      )}
    </View>
  );
}
