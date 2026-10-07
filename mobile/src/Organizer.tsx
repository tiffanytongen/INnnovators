import { normalizeCrowd, CROWD_LABELS, type CrowdLevel, type CrowdState } from "../../lib/crowd-model";
import { displayTime } from "./participant-model";
// Organizer side (Fieldday staff): Incident → AI check → preview → Approve & send; and the Pre-mortem.
// All AI calls happen on the laptop server (it holds the API key); this screen only talks to it.
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { canonical, describePart, parseScenario, type ScenarioPart } from "../../lib/scenario";
import SiteMap, { type MapData } from "./SiteMap";
import { C, s, getJSON, postJSON } from "./theme";

const DEMO_TEXT = "Storm at 11pm, Gate A closed, Sandringham line +25 min, accessible shuttle full";
const ICONS: Record<ScenarioPart["type"], string> = { STORM: "🌧", GATE_CLOSED: "🚫", TRAIN_DELAY: "🚆", SHUTTLE_FULL: "♿", HEAT: "🌡", SET_DELAY: "🎤" };
const WHO: Record<string, string> = { mei_19: "Mei · reads Mandarin · train", tom_70: "Tom · wheelchair · shuttle", jake_16: "Jake, 16 · parent pickup" };

type Parsed = { code: string | null; parts: ScenarioPart[]; human_only: { issue: string; why: string }[]; unmatched: string[] };
type Preview = {
  code: string;
  total_people: number;
  affected_people: number;
  no_plan_people: number;
  samples: { person_id: string; name: string; lang: string; plan: { text_localised: string; action: string } | null }[];
  simulated_sms: { to: string; text: string }[];
  needs_human: { name: string; reason: string }[];
  map: MapData;
  closed_gates: string[];
  closed_places: string[];
  storm: boolean;
  gate_delta: Record<string, number>;
};
type Premortem = {
  total_people: number;
  fixes: { id: string; name: string; capacity: number }[];
  results: { scenario: string; no_plan: number; groups: { key: string; label: string; people: number; reason: string }[] }[];
};

const label = (code: string) => (code === "NORMAL" ? "Normal night" : (parseScenario(code) ?? []).map(describePart).join(" + "));

export default function Organizer({ server }: { server: string }) {
  const [tab, setTab] = useState<"incident" | "crowd" | "premortem">("incident");
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
        <Text style={s.hello}>Fieldday Ops</Text>
        <Text style={s.muted}>Riverside · Saturday · 15,487 attendees</Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          {([["incident", "Something changed"], ["crowd", "Live crowd"], ["premortem", "Pre-mortem"]] as const).map(([k, l]) => (
            <Pressable key={k} onPress={() => setTab(k)} style={[s.tag, { backgroundColor: tab === k ? C.text : C.card, borderWidth: 1, borderColor: tab === k ? C.text : C.line, paddingHorizontal: 14, paddingVertical: 8 }]}>
              <Text style={{ color: tab === k ? "#fff" : C.text, fontWeight: "700", fontSize: 14 }}>{l}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {tab === "incident" ? (
        <Incident server={server} onPremortem={() => setTab("premortem")} />
      ) : tab === "crowd" ? (
        <CrowdTab server={server} />
      ) : (
        <PremortemTab server={server} />
      )}
    </View>
  );
}

function StepCard({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <View style={[s.card, { gap: 12 }]}>
      <View style={s.row}>
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: done ? C.green : C.text, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "900" }}>{done ? "✓" : n}</Text>
        </View>
        <Text style={[s.cardTitle, { fontSize: 20 }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Button({ title, onPress, busy, kind = "dark", disabled }: { title: string; onPress: () => void; busy?: boolean; kind?: "dark" | "yellow" | "light"; disabled?: boolean }) {
  const bg = kind === "yellow" ? C.alert : kind === "light" ? C.card : C.text;
  const fg = kind === "dark" ? "#fff" : C.text;
  return (
    <Pressable onPress={onPress} disabled={busy || disabled} style={({ pressed }) => [{ backgroundColor: bg, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, borderWidth: kind === "light" ? 1 : 0, borderColor: C.line }, (pressed || busy || disabled) && s.pressed]}>
      {busy && <ActivityIndicator color={fg} />}
      <Text style={{ color: fg, fontSize: 17, fontWeight: "800" }}>{title}</Text>
    </Pressable>
  );
}

// ---------- Incident: one sentence → everyone's phone ----------
function Incident({ server, onPremortem }: { server: string; onPremortem: () => void }) {
  const [text, setText] = useState(DEMO_TEXT);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [parts, setParts] = useState<ScenarioPart[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [approver, setApprover] = useState("Jess");
  const [sent, setSent] = useState<{ trigger: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function run(what: string, f: () => Promise<void>) {
    setBusy(what);
    setError("");
    try {
      await f();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  const check = () =>
    run("check", async () => {
      setSent(null);
      setPreview(null);
      const p = await postJSON<Parsed>(`${server}/api/parse`, { text });
      setParsed(p);
      setParts(p.parts);
      if (p.code) setPreview(await postJSON<Preview>(`${server}/api/preview`, { code: p.code }));
    });

  const removePart = (i: number) =>
    run("update", async () => {
      const next = parts.filter((_, j) => j !== i);
      setParts(next);
      setSent(null);
      setPreview(next.length ? await postJSON<Preview>(`${server}/api/preview`, { code: canonical(next) }) : null);
    });

  const send = () => run("send", async () => setSent(await postJSON(`${server}/api/approve`, { code: preview!.code, approved_by: approver, original_text: text })));

  const allClear = () =>
    run("reset", async () => {
      await postJSON(`${server}/api/approve`, { code: "NORMAL", approved_by: approver, original_text: "All clear" });
      setParsed(null);
      setParts([]);
      setPreview(null);
      setSent(null);
    });

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <StepCard n={1} title="What's happening?" done={!!parsed}>
        <TextInput value={text} onChangeText={setText} multiline placeholder="Type it like a text message, e.g. storm at 11, gate A shut" placeholderTextColor="#9A968E" style={[s.input, { minHeight: 80, textAlignVertical: "top", fontSize: 17 }]} />
        <Button title={busy === "check" ? "AI is reading…" : "Check"} onPress={check} busy={busy === "check"} disabled={!text.trim()} />
        {parsed && (
          <View style={{ gap: 8 }}>
            <Text style={s.muted}>The AI understood this. Tap ✕ to remove anything that’s wrong.</Text>
            {parts.map((p, i) => (
              <View key={i} style={[s.row, { backgroundColor: C.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 }]}>
                <Text style={[s.cardTitle, { flex: 1, fontSize: 17 }]}>{ICONS[p.type]} {describePart(p)}</Text>
                <Pressable onPress={() => removePart(i)} hitSlop={10}><Text style={{ color: C.muted, fontSize: 18 }}>✕</Text></Pressable>
              </View>
            ))}
            {parsed.human_only.map((h) => (
              <Text key={h.issue} style={s.redBox}>🚨 “{h.issue}”: this needs a person, not the app. Call security / first aid now. Plan B will not send this.</Text>
            ))}
            {parsed.unmatched.length > 0 && <Text style={s.muted}>Not understood (ignored): {parsed.unmatched.join("; ")}</Text>}
          </View>
        )}
      </StepCard>

      {preview && (
        <StepCard n={2} title="What people will see" done={!!sent}>
          <Text style={s.body}>
            <Text style={{ fontSize: 26, fontWeight: "900" }}>{preview.affected_people.toLocaleString()}</Text> people get a new plan. Everyone else keeps their usual way home.
          </Text>
          <View style={{ borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: C.line }}>
            <SiteMap map={preview.map} closedGates={preview.closed_gates} closedPlaces={preview.closed_places} storm={preview.storm} gateDelta={preview.gate_delta} />
          </View>
          <Text style={s.tiny}>Red = closed. Yellow = extra people at that gate, so you know where to send staff.</Text>
          {preview.samples.map((x) => (
            <View key={x.person_id} style={{ backgroundColor: C.bg, borderRadius: 14, padding: 14, gap: 4 }}>
              <Text style={s.muted}>{WHO[x.person_id] ?? x.name}</Text>
              {x.plan ? (
                <>
                  <Text style={[s.cardTitle, { fontSize: 17 }]}>{x.plan.text_localised}</Text>
                  {x.lang !== "en" && <Text style={s.muted}>“{x.plan.action}”</Text>}
                </>
              ) : (
                <Text style={{ color: C.red }}>No plan generated yet</Text>
              )}
            </View>
          ))}
          {preview.simulated_sms.length > 0 && <Text style={s.body}>✉︎ Also texting {preview.simulated_sms.map((m) => m.to).join(", ")} the new pickup point.</Text>}
          {preview.no_plan_people > 0 && (
            <Pressable onPress={onPremortem} style={{ borderWidth: 1, borderColor: C.red, borderRadius: 14, padding: 12 }}>
              <Text style={{ color: C.red, fontSize: 15 }}>⚠︎ <Text style={{ fontWeight: "800" }}>{preview.no_plan_people} people</Text> have no way home in this situation. See the pre-mortem ›</Text>
            </Pressable>
          )}
          {preview.needs_human.length > 0 && <Text style={{ color: "#B45309" }}>Staff should check on: {preview.needs_human.map((n) => n.name).join(", ")}</Text>}
        </StepCard>
      )}

      {preview && (
        <StepCard n={3} title="Send" done={!!sent}>
          {sent ? (
            <View style={{ gap: 4 }}>
              <Text style={[s.cardTitle, { color: C.green }]}>Sent ✓ Phones update within a few seconds.</Text>
              <Text style={s.muted}>Every phone already has its plan saved. We only sent a {sent.trigger.length}-character signed code, small enough for a weak signal.</Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <View style={s.row}>
                <Text style={s.muted}>Approved by</Text>
                <TextInput value={approver} onChangeText={setApprover} style={[s.input, { flex: 1, paddingVertical: 8 }]} />
              </View>
              <Button kind="yellow" title={`Approve & send to ${preview.affected_people.toLocaleString()} phones`} onPress={send} busy={busy === "send"} disabled={!approver.trim()} />
            </View>
          )}
        </StepCard>
      )}

      {busy === "update" && <Text style={s.muted}>Updating…</Text>}
      {error ? <Text style={s.redBox}>{error.includes("Network") || error.includes("abort") ? `Can't reach the Plan B server at ${server}.` : error}</Text> : null}

      <Pressable onPress={allClear} disabled={!!busy}>
        <Text style={[s.smallLink, { textAlign: "center", marginTop: 6 }]}>All clear: put everyone back on Plan A</Text>
      </Pressable>
    </ScrollView>
  );
}


const ROUTE_NAMES: Record<string, string> = {
  route_A_open: "River Stage → Gate A",
  route_B_lawn: "Lawn path → Gate B",
  route_B_canopy: "Canopy walk → Gate B",
  covered_path_2: "Covered path → Gate C",
  route_C_open: "Open path → Gate C",
  ramp_path_D: "Accessible ramp → Gate D",
};

function CrowdTab({ server }: { server: string }) {
  const [crowd, setCrowd] = useState<CrowdState>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const revision = useRef(0);
  const updating = useRef(false);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (updating.current) return;
      const requestRevision = revision.current;
      try {
        const res = await getJSON<{ crowd: unknown }>(`${server}/api/crowd`);
        if (active && requestRevision === revision.current) { setCrowd(normalizeCrowd(res.crowd)); setError(""); }
      } catch (e) { if (active && requestRevision === revision.current) setError(String(e)); }
    };
    void refresh();
    const timer = setInterval(refresh, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [server]);

  async function update(routeId: string, level: CrowdLevel) {
    if (updating.current) return;
    updating.current = true;
    revision.current += 1;
    setBusy(routeId);
    setError("");

    try {
      const res = await postJSON<{ crowd: CrowdState }>(
        `${server}/api/crowd`,
        {
          route_id: routeId,
          level,
        }
      );

      setCrowd(normalizeCrowd(res.crowd));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      updating.current = false;
      setBusy("");
    }
  }

  return (
    <ScrollView
      contentContainerStyle={{
        padding: 16,
        gap: 12,
        paddingBottom: 40,
      }}
    >
      <View>
        <Text style={s.h2}>Live crowd conditions</Text>
        <Text style={s.muted}>
          Update walking routes as conditions change. Plan B can use this
          when choosing the best route.
        </Text>
      </View>

      {Object.keys(ROUTE_NAMES).map((routeId) => {
        const state = crowd[routeId];
        return (
        <View key={routeId} style={[s.card, { gap: 10 }]}>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>
                {ROUTE_NAMES[routeId] ?? routeId}
              </Text>
              <Text style={s.muted}>
                Current: {(state ? CROWD_LABELS[state.level] : "Unknown")}
              </Text>
            </View>
          </View>

          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            {(["low", "moderate", "heavy", "closed"] as CrowdLevel[]).map(
              (level) => (
                <Pressable
                  key={level}
                  disabled={!!busy}
                  onPress={() => update(routeId, level)}
                  style={[
                    s.tag,
                    {
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      backgroundColor:
                        state?.level === level ? C.text : C.bg,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontWeight: "700",
                      color: state?.level === level ? "#fff" : C.text,
                    }}
                  >
                    {CROWD_LABELS[level]}
                  </Text>
                </Pressable>
              )
            )}
          </View>

          <Text style={s.tiny}>
            Updated{" "}
            {displayTime(state?.updated_at)}
          </Text>
        </View>
      ); })}

      {error ? <Text style={s.redBox}>{error}</Text> : null}
    </ScrollView>
  );
}

// ---------- Pre-mortem: who would be stuck, weeks before ----------
function PremortemTab({ server }: { server: string }) {
  const [report, setReport] = useState<Premortem | null>(null);
  const [selected, setSelected] = useState("STORM+GATE_A+TRAIN_SAND_25+SHUTTLE_FULL");
  const [before, setBefore] = useState<number | null>(null);
  const [fix, setFix] = useState({ kind: "accessible", depart: "23:05", capacity: "150" });
  const [explain, setExplain] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getJSON<Premortem>(`${server}/api/premortem`, 15000).then(setReport, (e) => setError(String(e)));
  }, [server]);

  async function run(what: string, f: () => Promise<void>) {
    setBusy(what);
    setError("");
    try {
      await f();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  if (!report) return <View style={{ padding: 20 }}>{error ? <Text style={s.redBox}>Can’t reach the Plan B server at {server}.</Text> : <ActivityIndicator />}</View>;
  const current = report.results.find((r) => r.scenario === selected) ?? report.results[0];

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Text style={s.muted}>
        Before the festival, every attendee ({report.total_people.toLocaleString()} people) is tested against every situation, with real gate, cover, step-free and seat limits.
      </Text>

      <View style={{ gap: 8 }}>
        {report.results.map((r) => (
          <Pressable key={r.scenario} onPress={() => { setSelected(r.scenario); setBefore(null); setExplain(""); }} style={[s.card, s.row, { paddingVertical: 12 }, r.scenario === current.scenario && { borderColor: C.text, borderWidth: 2 }]}>
            <Text style={[s.body, { flex: 1, fontSize: 15 }]}>{label(r.scenario)}</Text>
            <Text style={{ fontSize: 20, fontWeight: "900", color: r.no_plan ? C.red : C.green }}>{r.no_plan}</Text>
          </Pressable>
        ))}
      </View>

      <View style={[s.card, { gap: 12 }]}>
        <Text style={s.sectionLabel}>{label(current.scenario)}</Text>
        <Text style={{ fontSize: 44, fontWeight: "900", color: current.no_plan ? C.red : C.green }}>
          {before !== null && before !== current.no_plan ? <Text style={{ color: C.muted, textDecorationLine: "line-through" }}>{before}</Text> : null}
          {before !== null && before !== current.no_plan ? " → " : ""}
          {current.no_plan}
        </Text>
        <Text style={[s.cardTitle, { marginTop: -8 }]}>people have no way home</Text>

        {current.groups.map((g) => (
          <View key={g.key} style={{ borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10, gap: 2 }}>
            <Text style={s.cardTitle}><Text style={{ color: C.red }}>{g.people}</Text> {g.label.toLowerCase()}</Text>
            <Text style={s.muted}>{g.reason}</Text>
          </View>
        ))}

        {current.no_plan > 0 && (
          <View style={{ gap: 8 }}>
            <Button kind="light" title={busy === "explain" ? "AI is thinking…" : "Explain with AI"} busy={busy === "explain"} onPress={() => run("explain", async () => setExplain((await postJSON<{ text: string }>(`${server}/api/premortem/explain`, { scenario: current.scenario })).text))} />
            {explain ? <Text style={[s.body, { backgroundColor: C.bg, borderRadius: 12, padding: 12 }]}>{explain}</Text> : null}
          </View>
        )}

        <View style={{ borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12, gap: 10 }}>
          <Text style={s.sectionLabel}>Fix it: add a resource</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {[["accessible", "Accessible shuttle"], ["accessible_taxi", "Accessible taxis"], ["general", "General shuttle"]].map(([k, l]) => (
              <Pressable key={k} onPress={() => setFix({ ...fix, kind: k })} style={[s.tag, { backgroundColor: fix.kind === k ? C.text : C.bg, paddingHorizontal: 12, paddingVertical: 8 }]}>
                <Text style={{ color: fix.kind === k ? "#fff" : C.text, fontWeight: "700" }}>{l}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}><Text style={s.muted}>Departs</Text><TextInput value={fix.depart} onChangeText={(v) => setFix({ ...fix, depart: v })} style={s.input} /></View>
            <View style={{ flex: 1 }}><Text style={s.muted}>Seats</Text><TextInput value={fix.capacity} keyboardType="number-pad" onChangeText={(v) => setFix({ ...fix, capacity: v })} style={s.input} /></View>
          </View>
          <Button kind="yellow" title="Add & re-run" busy={busy === "fix"} onPress={() => run("fix", async () => { setBefore(current.no_plan); setExplain(""); setReport(await postJSON<Premortem>(`${server}/api/premortem/fix`, { ...fix, capacity: Number(fix.capacity) })); })} />
          {report.fixes.length > 0 && (
            <Pressable onPress={() => run("reset", async () => { setBefore(null); setReport(await postJSON<Premortem>(`${server}/api/premortem/fix`, { action: "reset" })); })}>
              <Text style={s.smallLink}>Added: {report.fixes.map((f) => `${f.name} (${f.capacity} seats)`).join(", ")} · reset</Text>
            </Pressable>
          )}
        </View>
      </View>
      {error ? <Text style={s.redBox}>{error}</Text> : null}
    </ScrollView>
  );
}
