<<<<<<< HEAD
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

function getWebsiteUrl(): string | null {
  const configured = process.env.EXPO_PUBLIC_WEBSITE_URL?.trim();
  try {
    if (configured) {
      const url = new URL(configured);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    }
    // Expo Go supplies the computer's LAN address, not the phone's localhost.
    const hostUri = Constants.expoConfig?.hostUri;
    if (!__DEV__ || !hostUri) return null;
    const url = new URL(`http://${hostUri}`);
    url.port = '3000';
    url.pathname = '/';
    return url.href;
  } catch {
    return null;
  }
}

const websiteUrl = getWebsiteUrl();

export default function App() {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        {!websiteUrl || failed ? (
          <View style={styles.message}>
            <Text style={styles.title}>Cannot reach the website</Text>
            <Text style={styles.body}>
              {websiteUrl
                ? 'Keep the website running on your computer and connect your phone to the same Wi-Fi. Allow local network access for Expo Go.'
                : 'Set EXPO_PUBLIC_WEBSITE_URL in mobile/.env to your website’s full http:// or https:// address, then restart Expo.'}
            </Text>
            {websiteUrl && <Text selectable style={styles.address}>{websiteUrl}</Text>}
            {websiteUrl && (
              <Pressable
                accessibilityRole="button"
                style={styles.button}
                onPress={() => {
                  setFailed(false);
                  setAttempt((value) => value + 1);
                }}
              >
                <Text style={styles.buttonText}>Try again</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <WebView
            key={attempt}
            style={styles.container}
            source={{ uri: websiteUrl }}
            startInLoadingState
            allowsBackForwardNavigationGestures
            onError={() => setFailed(true)}
            onHttpError={(event) => {
              if (event.nativeEvent.url === websiteUrl) setFailed(true);
            }}
            renderLoading={() => (
              <View style={styles.loading}>
                <ActivityIndicator size="large" color="#171717" />
                <Text style={styles.body}>Opening INnnovators…</Text>
              </View>
            )}
          />
=======
// Plan B attendee app (Expo Go). Opens on a calm home screen; the full plan is one tap away.
// Talks to the Next.js server on your laptop; keeps every plan on the phone so it works in airplane mode.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, Vibration, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { pickCachedScenario } from "../lib/scenario";
import { verifyTrigger, type Trigger } from "../lib/trigger";
import { strings } from "../lib/i18n";
import SiteMap, { type MapData } from "./SiteMap";

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

const C = {
  bg: "#F5F4F0",
  card: "#FFFFFF",
  line: "#E7E4DD",
  text: "#141414",
  muted: "#6B6862",
  green: "#15803D",
  greenBg: "#E7F6EC",
  alert: "#FFD400",
  red: "#DC2626",
};
const HEROES = [
  { id: "mei_19", name: "Mei", desc: "19 · reads Mandarin · train home" },
  { id: "tom_70", name: "Tom", desc: "70 · wheelchair · booked shuttle" },
  { id: "jake_16", name: "Jake", desc: "16 · first festival · parent pickup" },
];

// The laptop running `npm start`: same IP Expo Go loaded this app from, port 3000.
function defaultServer() {
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return host ? `http://${host}:${Constants.expoConfig?.extra?.serverPort ?? 3000}` : "http://localhost:3000";
}

async function getJSON<T>(url: string, ms = 3000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "cache-control": "no-store" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

const store = {
  async get<T>(k: string): Promise<T | null> {
    try {
      const v = await AsyncStorage.getItem(k);
      return v ? (JSON.parse(v) as T) : null;
    } catch {
      return null;
    }
  },
  set: (k: string, v: unknown) => AsyncStorage.setItem(k, JSON.stringify(v)).catch(() => {}),
};

const hhmm = (unix: number) => {
  const d = new Date(unix * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export default function App() {
  const [ready, setReady] = useState(false);
  const [server, setServer] = useState(defaultServer());
  const [personId, setPersonId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [savedServer, savedPerson] = await Promise.all([store.get<string>("planb:server"), store.get<string>("planb:person")]);
      if (savedServer) setServer(savedServer);
      if (savedPerson) setPersonId(savedPerson);
      setReady(true);
    })();
  }, []);

  const choose = (id: string | null) => {
    setPersonId(id);
    if (id) store.set("planb:person", id);
    else AsyncStorage.removeItem("planb:person");
  };

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={s.screen} edges={["top", "bottom"]}>
        {!ready ? null : personId ? (
          <PersonApp server={server} personId={personId} onSwitch={() => choose(null)} />
        ) : (
          <PickScreen server={server} onServer={(v) => { setServer(v); store.set("planb:server", v); }} onPick={choose} />
>>>>>>> 531c703d045bec8f93e872f176c445ad09e78bad
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

<<<<<<< HEAD
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  message: { flex: 1, justifyContent: 'center', padding: 28, gap: 18 },
  title: { fontSize: 24, fontWeight: '600', color: '#171717' },
  body: { fontSize: 16, lineHeight: 24, color: '#52525b' },
  address: { fontSize: 14, color: '#52525b' },
  button: { alignSelf: 'flex-start', paddingVertical: 14, paddingHorizontal: 24, backgroundColor: '#171717', borderRadius: 24 },
  buttonText: { fontSize: 16, fontWeight: '600', color: '#ffffff' },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: '#ffffff' },
=======
// ---------- demo: choose whose phone this is ----------
function PickScreen({ server, onServer, onPick }: { server: string; onServer: (v: string) => void; onPick: (id: string) => void }) {
  const [other, setOther] = useState("");
  const [status, setStatus] = useState<"checking" | "ok" | "fail">("checking");
  useEffect(() => {
    setStatus("checking");
    getJSON(`${server}/api/trigger`).then(() => setStatus("ok"), () => setStatus("fail"));
  }, [server]);

  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 14 }}>
      <Text style={s.brand}>Plan B</Text>
      <Text style={[s.muted, { fontSize: 17 }]}>Plan A is your day. Plan B is what happens when it changes.</Text>
      <Text style={[s.sectionLabel, { marginTop: 18 }]}>Whose phone is this?</Text>
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
      <Pressable onPress={() => Linking.openURL(`${server}/signup`)}>
        <Text style={s.link}>New here? 30-second sign-up</Text>
      </Pressable>
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

  if (!bundle || !current?.plan)
    return (
      <View style={{ padding: 24, gap: 16 }}>
        <Text style={s.h2}>{error || (bundle ? "Your plan is still being prepared." : "Loading your plan…")}</Text>
        <Pressable onPress={onSwitch}><Text style={s.link}>Choose someone else</Text></Pressable>
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
function HomeScreen({ bundle, plan, scenarioKey, isPlanB, trigger, online, t, name, server, onOpen, onSwitch }: ScreenProps & { onOpen: () => void; onSwitch: () => void }) {
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
      {isPlanB ? (
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

      {/* Way home */}
      <Pressable onPress={onOpen} style={({ pressed }) => [s.card, pressed && s.pressed]}>
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
      </Pressable>

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
function PlanScreen({ bundle, plan, scenarioKey, isPlanB, exact, trigger, online, t, name, onBack }: ScreenProps & { onBack: () => void }) {
  const [step, setStep] = useState(0);
  const steps: Step[] = [plan, ...plan.alternatives];
  const escalating = step >= steps.length;
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
              <Text style={s.body}>Planned exit: {name(plan.gate_id)} → {plan.transport.line} {plan.transport.depart ?? ""}</Text>
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

            <RouteMap bundle={bundle} st={st} scenarioKey={scenarioKey} />

            {st.volunteer_escort && <Text style={s.badge}>🙋 {t.volunteer}</Text>}
            {st.notify_contact && <Text style={s.badge}>✉︎ {t.contactNotified}</Text>}

            <View>
              <Text style={s.sectionLabel}>{t.why}</Text>
              <Text style={[s.body, { marginTop: 4 }]}>{st.reason_localised}</Text>
              {notEn && <Text style={[s.muted, { marginTop: 4 }]}>{st.reason}</Text>}
            </View>
            <Text style={s.tiny}>{t.source}: {plan.source}</Text>
          </>
        )}
      </ScrollView>

      <View style={s.footer}>
        {!escalating && (
          <Pressable onPress={() => setStep(step + 1)} style={({ pressed }) => [s.primaryButton, pressed && s.pressed]}>
            <Text style={s.primaryButtonText}>{t.notWork}</Text>
          </Pressable>
        )}
        {step > 0 && (
          <Pressable onPress={() => setStep(0)}>
            <Text style={[s.link, { textAlign: "center", padding: 6 }]}>{t.backToFirst}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function Detail({ label, value, time }: { label: string; value: string; time?: string | null }) {
  return (
    <View style={[s.row, { borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12 }]}>
      <View style={{ flex: 1 }}>
        <Text style={s.muted}>{label}</Text>
        <Text style={s.cardTitle}>{value}</Text>
      </View>
      {time ? <Text style={s.time}>{time}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  brand: { color: C.text, fontSize: 44, fontWeight: "900" },
  hello: { color: C.text, fontSize: 30, fontWeight: "800" },
  h1: { color: C.text, fontSize: 30, fontWeight: "800", lineHeight: 38, marginTop: 4 },
  h2: { color: C.text, fontSize: 22, fontWeight: "700" },
  sub: { color: C.muted, fontSize: 17, marginTop: 6 },
  body: { color: C.text, fontSize: 17, lineHeight: 24 },
  muted: { color: C.muted, fontSize: 15, lineHeight: 21 },
  tiny: { color: C.muted, fontSize: 12 },
  sectionLabel: { color: C.muted, fontSize: 13, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" },
  link: { color: C.text, fontSize: 16, fontWeight: "700", textDecorationLine: "underline" },
  smallLink: { color: C.muted, fontSize: 14, textDecorationLine: "underline" },
  card: { backgroundColor: C.card, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: C.line },
  cardTitle: { color: C.text, fontSize: 18, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  pressed: { opacity: 0.75 },
  chevron: { color: C.muted, fontSize: 28 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.alert, alignItems: "center", justifyContent: "center" },
  avatarText: { color: C.text, fontSize: 22, fontWeight: "900" },
  gateBadge: { width: 56, height: 56, borderRadius: 14, backgroundColor: C.text, alignItems: "center", justifyContent: "center" },
  gateLetter: { color: "#fff", fontSize: 32, fontWeight: "900" },
  time: { color: C.text, fontSize: 24, fontWeight: "900" },
  signalPill: { backgroundColor: C.greenBg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  signalPillText: { color: C.green, fontSize: 13, fontWeight: "700" },
  alertCard: { backgroundColor: C.alert, borderRadius: 20, padding: 18, gap: 8 },
  alertTitle: { color: C.text, fontSize: 18, fontWeight: "900" },
  alertBody: { color: C.text, fontSize: 20, fontWeight: "700", lineHeight: 27 },
  alertCta: { color: C.text, fontSize: 16, fontWeight: "800", marginTop: 4 },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 12 },
  back: { color: C.text, fontSize: 18, fontWeight: "700" },
  tag: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  tagText: { fontSize: 13, fontWeight: "800" },
  offlineBar: { backgroundColor: "#EDEBE6", color: C.text, paddingHorizontal: 20, paddingVertical: 8, fontSize: 14, fontWeight: "600" },
  badge: { backgroundColor: C.card, borderColor: C.line, borderWidth: 1, color: C.text, borderRadius: 14, overflow: "hidden", paddingHorizontal: 16, paddingVertical: 12, fontSize: 17, fontWeight: "600" },
  redBox: { backgroundColor: C.red, color: "#fff", borderRadius: 14, overflow: "hidden", padding: 14, fontSize: 17, fontWeight: "800" },
  noteBox: { borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 10, color: C.muted, fontSize: 14 },
  footer: { padding: 16, gap: 6, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.line },
  primaryButton: { backgroundColor: C.text, borderRadius: 18, paddingVertical: 16, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  secondaryButton: { backgroundColor: C.card, borderColor: C.line, borderWidth: 1, borderRadius: 14, paddingHorizontal: 18, justifyContent: "center" },
  secondaryButtonText: { color: C.text, fontSize: 16, fontWeight: "700" },
  input: { backgroundColor: C.card, borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 12, color: C.text, fontSize: 16 },
>>>>>>> 531c703d045bec8f93e872f176c445ad09e78bad
});
