// Organizer side (Fieldday staff): Incident → AI check → preview → Approve & send; and the Pre-mortem.
// All AI calls happen on the laptop server (it holds the API key); this screen only talks to it.
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { canonical, describePart, parseScenario, type ScenarioPart } from "../../lib/scenario";
import SiteMap, { type MapData } from "./SiteMap";
import { s, getJSON, postJSON } from "./theme";
import { Badge, Band, Btn, Card, Chips, Field, Notice, Txt, usePal } from "./ui";

const DEMO_TEXT = "Storm at 11pm, Gate A closed, Sandringham line +25 min, accessible shuttle full";
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
  const p = usePal();
  const [tab, setTab] = useState<"incident" | "premortem">("incident");
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Band height={200}>
        <View style={[s.gutter, { paddingTop: 14, paddingBottom: 20 }]}>
          <Txt k="title">Fieldday Ops</Txt>
          <Txt k="headline" c="sub" style={{ fontFamily: "Jost_400Regular" }}>Riverside · Saturday</Txt>
        </View>
        <View style={s.gutter}>
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: p.accent, alignItems: "center", justifyContent: "center" }}>
                <Txt k="label" c="onAccent">B</Txt>
              </View>
              <View style={{ width: 1, height: 22, backgroundColor: p.line }} />
              <Txt k="bodyStrong" style={{ flex: 1 }}>Staff console</Txt>
              <Badge>Live</Badge>
            </View>
            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 8 }}>
              <Txt k="mega" style={{ fontSize: 60, lineHeight: 68 }}>15,487</Txt>
              <Txt k="bodyStrong" c="sub">attendees</Txt>
            </View>
            <View role="tablist" style={{ flexDirection: "row", padding: 4, borderRadius: 999, backgroundColor: p.raised }}>
              {([["incident", "Something changed"], ["premortem", "Pre-mortem"]] as const).map(([k, l]) => (
                <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} onPress={() => setTab(k)} style={[{ flex: 1, minHeight: 44, borderRadius: 999, alignItems: "center", justifyContent: "center" }, tab === k && [s.shadow, { backgroundColor: p.card }]]}>
                  <Txt k="smallStrong" c={tab === k ? "ink" : "sub"}>{l}</Txt>
                </Pressable>
              ))}
            </View>
          </Card>
        </View>
      </Band>
      <View style={{ marginTop: 16 }}>
        {tab === "incident" ? <Incident server={server} onPremortem={() => setTab("premortem")} /> : <PremortemTab server={server} />}
      </View>
    </ScrollView>
  );
}

// A numbered stage of the incident flow, as a card.
function StepCard({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  const p = usePal();
  return (
    <View style={[s.gutter, { marginBottom: 16 }]}>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: done ? p.badgeBg : p.accent, alignItems: "center", justifyContent: "center" }}>
            <Txt k="smallStrong" c={done ? "badgeInk" : "onAccent"}>{done ? "✓" : n}</Txt>
          </View>
          <Txt k="headline" style={{ flex: 1 }}>{title}</Txt>
        </View>
        {children}
      </Card>
    </View>
  );
}

function Button({ title, onPress, busy, kind = "dark", disabled }: { title: string; onPress: () => void; busy?: boolean; kind?: "dark" | "yellow" | "light"; disabled?: boolean }) {
  return <Btn title={title} onPress={onPress} busy={busy} disabled={disabled} kind={kind === "light" ? "line" : "solid"} />;
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

  const p = usePal();
  return (
    <View>
      <StepCard n={1} title="What's happening?" done={!!parsed}>
        <Field value={text} onChangeText={setText} multiline accessibilityLabel="What's happening?" placeholder="Type it like a text message, e.g. storm at 11, gate A shut" style={{ minHeight: 96, textAlignVertical: "top", fontSize: 18, lineHeight: 25 }} />
        <Button title={busy === "check" ? "AI is reading…" : "Check"} onPress={check} busy={busy === "check"} disabled={!text.trim()} />
        {parsed && (
          <View style={{ gap: 2 }}>
            <Txt k="small" c="sub" style={{ marginBottom: 6 }}>The AI understood this. Remove anything that's wrong.</Txt>
            {parts.map((x, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", minHeight: 52, borderTopWidth: 1, borderTopColor: p.line }}>
                <Txt k="big" style={{ flex: 1 }}>{describePart(x)}</Txt>
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${describePart(x)}`} onPress={() => removePart(i)} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
                  <Txt k="big" c="sub">✕</Txt>
                </Pressable>
              </View>
            ))}
            {parsed.human_only.map((h) => (
              <Notice key={h.issue}>“{h.issue}”: this needs a person, not the app. Call security / first aid now. Plan B will not send this.</Notice>
            ))}
            {parsed.unmatched.length > 0 && <Txt k="small" c="sub">Not understood (ignored): {parsed.unmatched.join("; ")}</Txt>}
          </View>
        )}
      </StepCard>

      {preview && (
        <StepCard n={2} title="What people will see" done={!!sent}>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
            <Txt k="mega" c="accent" style={{ fontSize: 56, lineHeight: 62 }}>{preview.affected_people.toLocaleString()}</Txt>
            <Txt k="bodyStrong" style={{ flex: 1, paddingBottom: 6 }}>people get a new plan. Everyone else keeps their usual way home.</Txt>
          </View>
          <View style={{ borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: p.line }}>
            <SiteMap map={preview.map} closedGates={preview.closed_gates} closedPlaces={preview.closed_places} storm={preview.storm} gateDelta={preview.gate_delta} />
          </View>
          <Txt k="small" c="sub">Red = closed. Yellow = extra people at that gate, so you know where to send staff.</Txt>
          {preview.samples.map((x) => (
            <View key={x.person_id} style={{ gap: 4, paddingTop: 12, borderTopWidth: 1, borderTopColor: p.line }}>
              <Txt k="label" c="sub">{WHO[x.person_id] ?? x.name}</Txt>
              {x.plan ? (
                <>
                  <Txt k="bodyStrong">{x.plan.text_localised}</Txt>
                  {x.lang !== "en" && <Txt k="small" c="sub">“{x.plan.action}”</Txt>}
                </>
              ) : (
                <Txt c="danger">No plan generated yet</Txt>
              )}
            </View>
          ))}
          {preview.simulated_sms.length > 0 && <Txt>Also texting {preview.simulated_sms.map((m) => m.to).join(", ")} the new pickup point.</Txt>}
          {preview.no_plan_people > 0 && (
            <Pressable accessibilityRole="button" onPress={onPremortem} style={({ pressed }) => pressed && s.pressed}>
              <Notice>{preview.no_plan_people} people have no way home in this situation. See the pre-mortem →</Notice>
            </Pressable>
          )}
          {preview.needs_human.length > 0 && <Txt k="bodyStrong" c="danger">Staff should check on: {preview.needs_human.map((n) => n.name).join(", ")}</Txt>}
        </StepCard>
      )}

      {preview && (
        <StepCard n={3} title="Send" done={!!sent}>
          {sent ? (
            <View style={{ gap: 6 }}>
              <Txt k="big" c="ok">Sent. Phones update within a few seconds.</Txt>
              <Txt c="sub">Every phone already has its plan saved. We only sent a {sent.trigger.length}-character signed code, small enough for a weak signal.</Txt>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <View style={s.row}>
                <Txt k="label" c="sub">Approved by</Txt>
                <Field value={approver} onChangeText={setApprover} accessibilityLabel="Approved by" style={{ flex: 1, minWidth: 0, paddingVertical: 10 }} />
              </View>
              <Button kind="yellow" title={`Approve & send to ${preview.affected_people.toLocaleString()} phones`} onPress={send} busy={busy === "send"} disabled={!approver.trim()} />
            </View>
          )}
        </StepCard>
      )}

      <View style={[s.gutter, { gap: 12 }]}>
        {busy === "update" && <Txt c="sub">Updating…</Txt>}
        {error ? <Notice>{error.includes("Network") || error.includes("abort") ? `Can't reach the Plan B server at ${server}.` : error}</Notice> : null}
        <Btn kind="ghost" title="All clear: put everyone back on Plan A" onPress={allClear} disabled={!!busy} />
      </View>
    </View>
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

  const p = usePal();
  if (!report) return <View style={{ padding: 20 }}>{error ? <Notice>Can't reach the Plan B server at {server}.</Notice> : <ActivityIndicator color={p.accent} />}</View>;
  const current = report.results.find((r) => r.scenario === selected) ?? report.results[0];
  const changed = before !== null && before !== current.no_plan;

  return (
    <View style={{ gap: 16 }}>
      <Txt k="small" c="sub" style={s.gutter}>
        Before the festival, every attendee ({report.total_people.toLocaleString()} people) is tested against every situation, with real gate, cover, step-free and seat limits.
      </Txt>

      {/* Scoreboard: scenario left, people with no way home right. */}
      <View style={s.gutter}>
       <Card style={{ paddingHorizontal: 0, paddingBottom: 6, gap: 4 }}>
        <View style={[s.gutter, s.between]}><Txt k="label" c="sub">Scenario</Txt><Txt k="label" c="sub">No way home</Txt></View>
        {report.results.map((r) => {
          const on = r.scenario === current.scenario;
          return (
            <Pressable
              key={r.scenario}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => { setSelected(r.scenario); setBefore(null); setExplain(""); }}
              style={({ pressed }) => [s.gutter, { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, borderTopWidth: 1, borderTopColor: p.line, backgroundColor: on ? p.raised : "transparent" }, pressed && s.pressed]}
            >
              <Txt k={on ? "bodyStrong" : "body"} style={{ flex: 1, fontSize: 16 }}>{label(r.scenario)}</Txt>
              <View style={{ minWidth: 52, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 999, alignItems: "center", backgroundColor: r.no_plan ? "#FDE8E4" : p.badgeBg }}>
                <Txt k="big" style={{ color: r.no_plan ? p.danger : p.badgeInk }}>{r.no_plan}</Txt>
              </View>
            </Pressable>
          );
        })}
       </Card>
      </View>

      <View style={s.gutter}>
       <Card>
        <Badge>{label(current.scenario)}</Badge>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 14, flexWrap: "wrap" }}>
          {changed && <Txt k="huge" c="sub" style={{ textDecorationLine: "line-through" }}>{before}</Txt>}
          <Txt k="mega" c={current.no_plan ? "danger" : "ok"}>{current.no_plan}</Txt>
          <Txt k="big" style={{ paddingBottom: 12, flexShrink: 1 }}>people have{"\n"}no way home</Txt>
        </View>

        {current.groups.map((g) => (
          <View key={g.key} style={{ borderTopWidth: 1, borderTopColor: p.line, paddingTop: 10, gap: 2 }}>
            <Txt k="bodyStrong"><Txt k="bodyStrong" c="danger">{g.people}</Txt> {g.label.toLowerCase()}</Txt>
            <Txt k="small" c="sub">{g.reason}</Txt>
          </View>
        ))}

        {current.no_plan > 0 && (
          <View style={{ gap: 10 }}>
            <Button kind="light" title={busy === "explain" ? "AI is thinking…" : "Explain with AI"} busy={busy === "explain"} onPress={() => run("explain", async () => setExplain((await postJSON<{ text: string }>(`${server}/api/premortem/explain`, { scenario: current.scenario })).text))} />
            {explain ? <Txt style={{ backgroundColor: p.raised, padding: 14, borderRadius: 16 }}>{explain}</Txt> : null}
          </View>
        )}
       </Card>
      </View>

      <View style={s.gutter}>
       <Card>
        <Txt k="headline">Fix it: add a resource</Txt>
        <Chips options={[["accessible", "Accessible shuttle"], ["accessible_taxi", "Accessible taxis"], ["general", "General shuttle"]]} value={fix.kind} onChange={(k) => setFix({ ...fix, kind: k })} />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1, gap: 6 }}><Txt k="label" c="sub">Departs</Txt><Field value={fix.depart} accessibilityLabel="Departs" onChangeText={(v) => setFix({ ...fix, depart: v })} /></View>
          <View style={{ flex: 1, gap: 6 }}><Txt k="label" c="sub">Seats</Txt><Field value={fix.capacity} accessibilityLabel="Seats" keyboardType="number-pad" onChangeText={(v) => setFix({ ...fix, capacity: v })} /></View>
        </View>
        <Button kind="yellow" title="Add & re-run" busy={busy === "fix"} onPress={() => run("fix", async () => { setBefore(current.no_plan); setExplain(""); setReport(await postJSON<Premortem>(`${server}/api/premortem/fix`, { ...fix, capacity: Number(fix.capacity) })); })} />
        {report.fixes.length > 0 && (
          <Btn kind="ghost" title={`Added: ${report.fixes.map((f) => `${f.name} (${f.capacity} seats)`).join(", ")} · reset`} onPress={() => run("reset", async () => { setBefore(null); setReport(await postJSON<Premortem>(`${server}/api/premortem/fix`, { action: "reset" })); })} />
        )}
        {error ? <Notice>{error}</Notice> : null}
       </Card>
      </View>
    </View>
  );
}
