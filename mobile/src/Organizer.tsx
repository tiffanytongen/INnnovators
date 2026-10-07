// Organizer experience (muted green): an operational surface, two screens.
//   Tonight    — normal-night status → "Something changed?" → triage (solved vs needs you) → send.
//   Pre-mortem — the weakness Plan B found before the event, and a verified contingency.
// All AI calls happen on the laptop server (it holds the API keys); this screen only talks to it.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Keyboard, Pressable, ScrollView, Text, View } from "react-native";
import { canonical, describePart, parseScenario, type ScenarioPart } from "../../lib/scenario";
import SiteMap, { type MapData } from "./SiteMap";
import WeatherPanel from "./WeatherPanel";
import CrowdPanel from "./CrowdPanel";
import { F, getJSON, postJSON, s } from "./theme";
import { Btn, Card, Check, Field, Notice, Txt, usePal } from "./ui";

const DEMO_TEXT = "Storm at 11pm, Gate A closed, Sandringham line +25 min, accessible shuttle full";
const WHO: Record<string, string> = { mei_19: "Mei · reads Mandarin", tom_70: "Tom · wheelchair", jake_16: "Jake, 16 · parent pickup" };
const CAUSE: Record<ScenarioPart["type"], string> = {
  STORM: "severe weather", GATE_CLOSED: "a gate closure", TRAIN_DELAY: "train delays", SHUTTLE_FULL: "a full shuttle", HEAT: "extreme heat", SET_DELAY: "a stage running late",
};

type Parsed = { code: string | null; parts: ScenarioPart[]; human_only: { issue: string; why: string }[]; unmatched: string[] };
type Preview = {
  code: string; total_people: number; affected_people: number; no_plan_people: number; waited_people: number; no_plan_groups: { label: string; people: number }[];
  samples: { person_id: string; name: string; lang: string; plan: { text_localised: string; action: string } | null }[];
  simulated_sms: { to: string; text: string }[];
  needs_human: { name: string; reason: string }[];
  map: MapData; closed_gates: string[]; closed_places: string[]; storm: boolean; gate_delta: Record<string, number>;
};
type Contingency = { kind: string; depart: string; capacity: number; label: string; after: number };
type Result = { scenario: string; no_plan: number; groups: { key: string; label: string; people: number; reason: string }[]; constraint?: string; contingency?: Contingency | null };
type Premortem = { total_people: number; fixes: { id: string; name: string; capacity: number }[]; results: Result[] };

const label = (code: string) => (code === "NORMAL" ? "Normal night" : (parseScenario(code) ?? []).map(describePart).join(" · "));

export default function Organizer({ server }: { server: string }) {
  const p = usePal();
  const [screen, setScreen] = useState<"tonight" | "premortem">("tonight");
  const [focus, setFocus] = useState<string | null>(null);
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: p.band }}>
        {([["tonight", "Tonight"], ["premortem", "Pre-mortem"]] as const).map(([k, l]) => {
          const on = screen === k;
          return (
            <Pressable key={k} onPress={() => setScreen(k)} style={({ pressed }) => [{ paddingHorizontal: 16, minHeight: 38, justifyContent: "center", borderRadius: 999, backgroundColor: on ? p.card : "transparent" }, pressed && s.pressed]}>
              <Text style={{ fontFamily: on ? F.bodySemi : F.body, fontSize: 15, color: on ? p.ink : p.sub }}>{l}</Text>
            </Pressable>
          );
        })}
      </View>
      {screen === "tonight" ? (
        <Tonight server={server} onFix={(code) => { setFocus(code); setScreen("premortem"); }} />
      ) : (
        <PremortemScreen server={server} focus={focus} />
      )}
    </View>
  );
}

function useRun() {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const run = async (what: string, f: () => Promise<void>) => {
    setBusy(what);
    setError("");
    try {
      await f();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };
  return { busy, error, run };
}

function Header({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
  const p = usePal();
  return (
    <View style={{ backgroundColor: p.band, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 28, gap: 6 }}>
      <Txt k="eyebrow" c="sub">{eyebrow}</Txt>
      <Txt k="title">{title}</Txt>
      <Txt c="sub">{sub}</Txt>
    </View>
  );
}

// ---------- Tonight ----------
function Tonight({ server, onFix }: { server: string; onFix: (code: string) => void }) {
  const p = usePal();
  const { busy, error, run } = useRun();
  const [normal, setNormal] = useState<Preview | null>(null);
  const [text, setText] = useState(DEMO_TEXT);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [parts, setParts] = useState<ScenarioPart[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [showStuck, setShowStuck] = useState(false);
  const [approver, setApprover] = useState("Jess");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    postJSON<Preview>(`${server}/api/preview`, { code: "NORMAL" }, 20000).then(setNormal, () => {});
  }, [server]);

  const check = () =>
    run("check", async () => {
      Keyboard.dismiss();
      setSent(false);
      setPreview(null);
      const r = await postJSON<Parsed>(`${server}/api/parse`, { text });
      setParsed(r);
      setParts(r.parts);
      if (r.code) setPreview(await postJSON<Preview>(`${server}/api/preview`, { code: r.code }));
    });
  const removePart = (i: number) =>
    run("update", async () => {
      const next = parts.filter((_, j) => j !== i);
      setParts(next);
      setSent(false);
      setPreview(next.length ? await postJSON<Preview>(`${server}/api/preview`, { code: canonical(next) }) : null);
    });
  const send = () => run("send", async () => { await postJSON(`${server}/api/approve`, { code: preview!.code, approved_by: approver, original_text: text }); setSent(true); });
  const allClear = () =>
    run("reset", async () => {
      await postJSON(`${server}/api/approve`, { code: "NORMAL", approved_by: approver, original_text: "All clear" });
      setParsed(null); setParts([]); setPreview(null); setSent(false);
    });

  const total = (preview ?? normal)?.total_people;
  const solved = preview ? preview.affected_people - preview.no_plan_people : 0;
  const cause = parts[0] ? CAUSE[parts[0].type] : "a change at the venue";

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <Header eyebrow="Fieldday Ops" title="Riverside" sub={total ? `${total.toLocaleString()} attendees · Saturday night` : "Saturday night"} />
      <View style={{ paddingHorizontal: 20, paddingTop: 24, gap: 22 }}>
        {!preview && normal && (
          <Card tint>
            <Txt k="eyebrow" c="ok">Running normally</Txt>
            <Txt k="big">Plan B is spreading departures.</Txt>
            <Txt c="sub">{normal.waited_people.toLocaleString()} attendees have a second-wave leaving time, so no gate goes over its limit.</Txt>
          </Card>
        )}

        {/* Something changed? */}
        <View style={{ gap: 10 }}>
          <Txt k="headline">Something changed?</Txt>
          <Field value={text} onChangeText={setText} multiline placeholder="Say it like a radio call: storm at 11, gate A shut" style={{ minHeight: 84, textAlignVertical: "top" }} />
          {!preview && <Btn title={busy === "check" ? "Reading…" : "Check"} onPress={check} busy={busy === "check"} disabled={!text.trim()} />}
          {parsed && (
            <View style={{ gap: 2 }}>
              {parts.map((x, i) => (
                <View key={i} style={[s.between, { minHeight: 44 }]}>
                  <Txt k="bodyStrong">{describePart(x)}</Txt>
                  <Pressable accessibilityRole="button" onPress={() => removePart(i)} hitSlop={12}><Txt c="sub">Remove</Txt></Pressable>
                </View>
              ))}
              {parsed.human_only.map((h) => (
                <Notice key={h.issue}>“{h.issue}” needs a person, not Plan B. Call security / first aid now.</Notice>
              ))}
              {parsed.unmatched.length > 0 && <Txt k="small" c="sub">Not understood: {parsed.unmatched.join("; ")}</Txt>}
              {preview && <Btn kind="ghost" title="Edit and check again" onPress={check} style={{ alignSelf: "flex-start" }} />}
            </View>
          )}
        </View>

        {/* Triage: everyone → handled automatically → needs a person */}
        {preview && (
          <Card style={{ gap: 0, padding: 0 }}>
            <View style={{ padding: 20, gap: 10 }}>
              <View style={s.between}>
                <Txt c="sub">Attendees checked</Txt>
                <Txt k="headline">{preview.total_people.toLocaleString()}</Txt>
              </View>
              <View style={s.between}>
                <Txt c="sub">Rerouted automatically</Txt>
                <Txt k="headline" c="ok">{solved.toLocaleString()}</Txt>
              </View>
            </View>
            <View style={{ backgroundColor: preview.no_plan_people ? "#FBE9E4" : p.soft, padding: 20, gap: 12 }}>
              {preview.no_plan_people > 0 ? (
                <>
                  <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
                    <Txt k="mega" c="danger">{preview.no_plan_people.toLocaleString()}</Txt>
                    <Txt k="bodyStrong" style={{ flex: 1, paddingBottom: 10 }}>need you: no viable way home</Txt>
                  </View>
                  {showStuck && (
                    <View style={{ gap: 6 }}>
                      {preview.no_plan_groups.map((g) => (
                        <View key={g.label} style={s.between}>
                          <Txt k="small" style={{ flex: 1 }}>{g.label}</Txt>
                          <Txt k="smallStrong">{g.people}</Txt>
                        </View>
                      ))}
                      {preview.needs_human.length > 0 && <Txt k="small" c="danger">Staff check-in: {preview.needs_human.map((n) => n.name).join(", ")}</Txt>}
                    </View>
                  )}
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <Btn kind="line" title={showStuck ? "Hide" : `Review ${preview.no_plan_people}`} onPress={() => setShowStuck(!showStuck)} style={{ flex: 1, backgroundColor: p.card, borderColor: p.danger }} />
                    <Btn title="Fix in pre-mortem" onPress={() => onFix(preview.code)} style={{ flex: 1.3 }} />
                  </View>
                </>
              ) : (
                <Txt k="bodyStrong" c="ok">Everyone has a viable way home.</Txt>
              )}
            </View>
            <View style={{ padding: 20, gap: 4 }}>
              <Txt k="bodyStrong">{preview.waited_people.toLocaleString()} released in waves</Txt>
              <Txt k="small" c="sub">Later leaving times keep every gate under capacity.</Txt>
              <Btn kind="ghost" title={showMap ? "Hide site map" : "Show site map"} onPress={() => setShowMap(!showMap)} style={{ alignSelf: "flex-start" }} />
              {showMap && (
                <View style={{ borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: p.line }}>
                  <SiteMap map={preview.map} closedGates={preview.closed_gates} closedPlaces={preview.closed_places} storm={preview.storm} gateDelta={preview.gate_delta} accent={p.accent} />
                </View>
              )}
            </View>
          </Card>
        )}

        {/* Send: no app to install, the plan travels through channels attendees already have */}
        {preview && (
          <View style={{ gap: 12 }}>
            <Txt k="headline">Send {solved.toLocaleString()} Plan Bs</Txt>
            <Txt c="sub">{"Attendees don't download anything. Each plan arrives through:"}</Txt>
            <View style={{ gap: 4 }}>
              <Check>SMS link</Check>
              <Check>Notification in the Fieldday app</Check>
              <Check>{"The Fieldday app's home screen"}</Check>
            </View>
            <View style={{ gap: 6, marginTop: 6 }}>
              <Txt k="small" c="sub">Message preview (simulated)</Txt>
              <View style={{ backgroundColor: p.raised, borderRadius: 20, borderBottomLeftRadius: 6, padding: 16, gap: 4, maxWidth: 320 }}>
                <Txt k="smallStrong">Fieldday</Txt>
                <Txt k="small">Your way home has changed due to {cause}. Your Plan B is ready:</Txt>
                <Txt k="smallStrong" c="accent">planb.link/m3i9</Txt>
              </View>
              <Txt k="small" c="sub">Demo only: no real SMS or notification is sent.</Txt>
              {preview.simulated_sms.length > 0 && <Txt k="small" c="sub">Also texts {preview.simulated_sms.map((m) => m.to).join(", ")} the new pickup point.</Txt>}
            </View>
            <View style={{ gap: 6, marginTop: 4 }}>
              <Txt k="smallStrong" c="sub">What attendees will see</Txt>
              {preview.samples.map((x) => (
                <View key={x.person_id} style={{ paddingVertical: 6 }}>
                  <Txt k="small" c="sub">{WHO[x.person_id] ?? x.name}</Txt>
                  <Txt numberOfLines={2}>{x.plan ? x.plan.text_localised : "No plan generated yet"}</Txt>
                </View>
              ))}
            </View>
            {sent ? (
              <Card tint><Txt k="bodyStrong" c="ok">Sent (simulated). Phones update within seconds.</Txt></Card>
            ) : (
              <>
                <View style={s.row}>
                  <Txt c="sub">Approved by</Txt>
                  <Field value={approver} onChangeText={setApprover} style={{ flex: 1, paddingVertical: 8 }} />
                </View>
                <Btn title="Approve & send" onPress={send} busy={busy === "send"} disabled={!approver.trim()} />
              </>
            )}
          </View>
        )}

        {busy === "update" && <ActivityIndicator color={p.accent} />}
        {error ? <Notice>{error.includes("Network") || error.includes("abort") ? `Can't reach the Plan B server at ${server}.` : error}</Notice> : null}

        {/* Live conditions: useful, but secondary, so folded away */}
        <View>
          <Fold title="Paths right now" sub="Mark busy or closed paths">
            <CrowdPanel server={server} />
          </Fold>
          <Fold title="Weather" sub="Live forecast and journey check">
            <WeatherPanel server={server} />
          </Fold>
        </View>
        <Btn kind="ghost" title="All clear: everyone back to Plan A" onPress={allClear} busy={busy === "reset"} />
      </View>
    </ScrollView>
  );
}

// A quiet disclosure row for secondary tools.
function Fold({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  const p = usePal();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ borderTopWidth: 1, borderBottomWidth: 1, marginTop: -1, borderColor: p.line }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={({ pressed }) => [s.between, { minHeight: 60 }, pressed && s.pressed]}>
        <View style={{ flex: 1 }}>
          <Txt k="bodyStrong">{title}</Txt>
          <Txt k="small" c="sub">{sub}</Txt>
        </View>
        <Txt k="headline" c="sub">{open ? "−" : "+"}</Txt>
      </Pressable>
      {open && <View style={{ paddingBottom: 16 }}>{children}</View>}
    </View>
  );
}

// ---------- Pre-mortem ----------
function PremortemScreen({ server, focus }: { server: string; focus: string | null }) {
  const p = usePal();
  const { busy, error, run } = useRun();
  const [report, setReport] = useState<Premortem | null>(null);
  const [selected, setSelected] = useState<string | null>(focus);
  const [before, setBefore] = useState<Record<string, number>>({});
  const [explain, setExplain] = useState("");

  const load = useCallback(() => getJSON<Premortem>(`${server}/api/premortem`, 20000).then((r) => {
    setReport(r);
    // Open on the severe-weather finding (the demo story); otherwise the biggest problem found.
    const storm = r.results.find((x) => x.scenario === "STORM" && x.no_plan > 0);
    setSelected((cur) => cur ?? storm?.scenario ?? [...r.results].sort((a, b) => b.no_plan - a.no_plan)[0]?.scenario ?? null);
  }), [server]);
  useEffect(() => { load().catch(() => {}); }, [load]);

  if (!report) return <View style={{ padding: 24 }}>{error ? <Notice>{error}</Notice> : <ActivityIndicator color={p.accent} />}</View>;
  const current = report.results.find((r) => r.scenario === selected) ?? report.results[0];
  const was = before[current.scenario];
  const others = report.results.filter((r) => r.scenario !== current.scenario && r.no_plan > 0);
  const clear = report.results.filter((r) => r.no_plan === 0).length;
  const c = current.contingency;

  const apply = () =>
    run("apply", async () => {
      setBefore({ ...before, [current.scenario]: current.no_plan });
      setExplain("");
      setReport(await postJSON<Premortem>(`${server}/api/premortem/fix`, { kind: c!.kind, depart: c!.depart, capacity: c!.capacity }));
    });
  const reset = () => run("reset", async () => { setBefore({}); setReport(await postJSON<Premortem>(`${server}/api/premortem/fix`, { action: "reset" })); });

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
      <Header eyebrow="Before the event" title="What could go wrong" sub={`Plan B tested all ${report.total_people.toLocaleString()} journeys home against ${report.results.length} situations, before gates open.`} />
      <View style={{ paddingHorizontal: 20, paddingTop: 24, gap: 22 }}>
        <Card style={{ gap: 16 }}>
          <Txt k="bodyStrong" c="sub">{label(current.scenario)}</Txt>
          {current.no_plan > 0 || was !== undefined ? (
            <>
              <View style={{ gap: 2 }}>
                <Txt k="mega" c={current.no_plan ? "danger" : "ok"}>{was !== undefined ? `${was} → ${current.no_plan}` : current.no_plan.toLocaleString()}</Txt>
                <Txt k="big">{consequence(current)}</Txt>
              </View>
              {current.groups.length > 0 && current.no_plan > 0 && (
                <View style={{ gap: 4 }}>
                  {current.groups.map((g) => (
                    <View key={g.key} style={s.between}>
                      <Txt k="small" c="sub" style={{ flex: 1 }}>{g.label}</Txt>
                      <Txt k="smallStrong">{g.people}</Txt>
                    </View>
                  ))}
                </View>
              )}
              {current.constraint && current.no_plan > 0 && (
                <View style={{ gap: 2 }}>
                  <Txt k="small" c="sub">Main constraint</Txt>
                  <Txt k="bodyStrong">{current.constraint}</Txt>
                </View>
              )}
              {c && current.no_plan > 0 && (
                <View style={{ backgroundColor: p.soft, borderRadius: 20, padding: 18, gap: 12 }}>
                  <View style={{ gap: 2 }}>
                    <Txt k="small" c="sub">Recommended contingency</Txt>
                    <Txt k="big">+1 {c.label}</Txt>
                    <Txt k="small" c="sub">Departs {c.depart} · {c.capacity} seats</Txt>
                  </View>
                  <Txt k="title" c="ok">{current.no_plan} → {c.after}</Txt>
                  <Btn title="Apply contingency" onPress={apply} busy={busy === "apply"} />
                </View>
              )}
              {current.no_plan === 0 && was !== undefined && <Txt k="bodyStrong" c="ok">Contingency applied. Everyone has a viable way home in this situation.</Txt>}
              {current.no_plan > 0 && (
                <Btn kind="ghost" title={busy === "explain" ? "Thinking…" : "Explain this finding"} busy={busy === "explain"} onPress={() => run("explain", async () => setExplain((await postJSON<{ text: string }>(`${server}/api/premortem/explain`, { scenario: current.scenario })).text))} style={{ alignSelf: "flex-start" }} />
              )}
              {explain ? <Txt c="sub">{explain}</Txt> : null}
            </>
          ) : (
            <Txt k="bodyStrong" c="ok">Everyone has a viable way home in this situation.</Txt>
          )}
        </Card>

        {others.length > 0 && (
          <View>
            <Txt k="headline" style={{ marginBottom: 6 }}>Also found</Txt>
            {others.map((r) => (
              <Pressable key={r.scenario} accessibilityRole="button" onPress={() => { setSelected(r.scenario); setExplain(""); }} style={({ pressed }) => [s.between, { minHeight: 64, paddingVertical: 10, borderTopWidth: 1, borderTopColor: p.line }, pressed && s.pressed]}>
                <View style={{ flex: 1 }}>
                  <Txt k="bodyStrong">{label(r.scenario)}</Txt>
                  <Txt k="small" c="sub">{r.no_plan.toLocaleString()} {consequence(r)}</Txt>
                </View>
                <Txt k="headline" c="danger">{r.no_plan}</Txt>
              </Pressable>
            ))}
          </View>
        )}
        <Txt k="small" c="sub">{clear} other situations: everyone has a viable way home.</Txt>

        {report.fixes.length > 0 && (
          <View style={{ gap: 4 }}>
            <Txt k="small" c="sub">Applied: {report.fixes.map((f) => `${f.name} (${f.capacity} seats)`).join(", ")}</Txt>
            <Btn kind="ghost" title="Reset contingencies" onPress={reset} busy={busy === "reset"} style={{ alignSelf: "flex-start" }} />
          </View>
        )}
        {error ? <Notice>{error}</Notice> : null}
      </View>
    </ScrollView>
  );
}

// What the number means, in operational words.
function consequence(r: Result) {
  if (r.no_plan === 0) return "attendees without a way home";
  return r.groups.length > 0 && r.groups.every((g) => /booked on a shuttle/.test(g.label) && !/wheelchair|step-free/i.test(g.label))
    ? "shuttle passengers lose their ride"
    : "attendees have no viable way home";
}
