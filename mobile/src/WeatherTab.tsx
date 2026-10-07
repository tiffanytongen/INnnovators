// Organizer → Weather: live forecast for the exit window, an AI check of attendees' plans against it,
// and proposed changes that a named organizer approves before anything reaches a phone.
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { describePart, parseScenario } from "../../lib/scenario";
import { C, s, getJSON, postJSON } from "./theme";

type Interval = { label: string; summary: string | null; precipitation: number | null; rain_probability: number | null; temperature: number | null; wind_speed: number | null; wind_gusts: number | null };
type Forecast = { status: "available" | "partial" | "unavailable" | "stale"; source: string; reason: string | null; retrieved_at: string | null; intervals: Interval[] };
type CheckResult = { person_id: string; name: string; outcome: "proposed" | "unchanged" | "staff_review" | "error"; detail: string };
type Step = { action: string; text_localised: string; reason: string; journey?: { main_tradeoff: string; leave_at: string } };
type Proposal = { id: string; person_name: string; scenario: string; change_summary: string[]; previous: Step | null; proposed: Step; created_at: string };

const label = (code: string) => (code === "NORMAL" ? "Normal night" : (parseScenario(code) ?? []).map(describePart).join(" + "));
const icon = (i: Interval) => ((i.precipitation ?? 0) >= 1 ? "🌧" : (i.precipitation ?? 0) > 0 ? "🌦" : (i.wind_gusts ?? 0) >= 15 ? "💨" : (i.temperature ?? 0) >= 32 ? "🌡" : "⛅️");
const OUTCOME: Record<CheckResult["outcome"], [string, string]> = {
  proposed: ["Change proposed", C.text],
  unchanged: ["No change needed", C.green],
  staff_review: ["Staff review", "#B45309"],
  error: ["Error", C.red],
};

export default function WeatherTab({ server }: { server: string }) {
  const [forecast, setForecast] = useState<{ scenario: string; forecast: Forecast } | null>(null);
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [approver, setApprover] = useState("Jess");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const loadProposals = useCallback(() => getJSON<{ proposals: Proposal[] }>(`${server}/api/revisions`, 8000).then((r) => setProposals(r.proposals)), [server]);
  useEffect(() => {
    getJSON<{ scenario: string; forecast: Forecast }>(`${server}/api/weather/forecast`, 15000).then(setForecast, () => setError(`Can't reach the Plan B server at ${server}.`));
    loadProposals().catch(() => {});
  }, [server, loadProposals]);

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
      const r = await postJSON<{ results: CheckResult[] }>(`${server}/api/weather/check`, {}, 240000);
      setResults(r.results);
      await loadProposals();
    });

  const approve = (id: string) =>
    run(id, async () => {
      await postJSON(`${server}/api/revisions/${id}/approve`, { approved_by: approver });
      await loadProposals();
    });

  const f = forecast?.forecast;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <View style={[s.card, { gap: 10 }]}>
        <Text style={[s.cardTitle, { fontSize: 20 }]}>Tonight's forecast</Text>
        {!forecast ? (
          error ? null : <ActivityIndicator />
        ) : (
          <>
            <Text style={s.muted}>
              Exit window for: {label(forecast.scenario)} · {f!.source}
              {f!.retrieved_at ? ` · updated ${new Date(f!.retrieved_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
            </Text>
            {f!.status !== "available" && <Text style={s.noteBox}>{f!.status === "unavailable" ? "⚠︎ No forecast: " : "⚠︎ "}{f!.reason}</Text>}
            {f!.intervals.map((i) => (
              <View key={i.label} style={[s.row, { borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8 }]}>
                <Text style={{ fontSize: 24 }}>{icon(i)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle}>{i.label} · {i.summary ?? "—"}</Text>
                  <Text style={s.muted}>
                    Rain {i.precipitation ?? "?"} mm/h{i.rain_probability != null ? ` (${i.rain_probability}%)` : ""} · wind {i.wind_speed ?? "?"} m/s{i.wind_gusts ? `, gusts ${i.wind_gusts}` : ""} · {i.temperature ?? "?"}°C
                  </Text>
                </View>
              </View>
            ))}
          </>
        )}
      </View>

      <View style={[s.card, { gap: 10 }]}>
        <Text style={[s.cardTitle, { fontSize: 20 }]}>Check plans against the weather</Text>
        <Text style={s.muted}>The AI re-checks each attendee's way home for this forecast (rain on open paths, waiting outside, wind), within their assigned gate and exit wave. Changes only go out after you approve them.</Text>
        <Pressable onPress={check} disabled={!!busy} style={({ pressed }) => [s.primaryButton, { flexDirection: "row", gap: 8, justifyContent: "center" }, (pressed || !!busy) && s.pressed]}>
          {busy === "check" && <ActivityIndicator color="#fff" />}
          <Text style={s.primaryButtonText}>{busy === "check" ? "AI is checking plans…" : "Run weather check"}</Text>
        </Pressable>
        {results?.map((r) => (
          <View key={r.person_id} style={{ borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8 }}>
            <Text style={[s.cardTitle, { color: OUTCOME[r.outcome][1] }]}>{r.name}: {OUTCOME[r.outcome][0]}</Text>
            <Text style={s.muted}>{r.detail}</Text>
          </View>
        ))}
      </View>

      <View style={[s.card, { gap: 10 }]}>
        <Text style={[s.cardTitle, { fontSize: 20 }]}>Changes waiting for approval {proposals.length ? `(${proposals.length})` : ""}</Text>
        {proposals.length === 0 && <Text style={s.muted}>Nothing to approve.</Text>}
        {proposals.length > 0 && (
          <View style={s.row}>
            <Text style={s.muted}>Approved by</Text>
            <TextInput value={approver} onChangeText={setApprover} style={[s.input, { flex: 1, paddingVertical: 8 }]} />
          </View>
        )}
        {proposals.map((p) => (
          <View key={p.id} style={{ backgroundColor: C.bg, borderRadius: 14, padding: 14, gap: 6 }}>
            <Text style={s.cardTitle}>{p.person_name} · {label(p.scenario)}</Text>
            {p.change_summary.map((c) => <Text key={c} style={s.body}>• {c}</Text>)}
            <Text style={[s.body, { fontWeight: "700" }]}>New: {p.proposed.text_localised}</Text>
            {p.proposed.journey?.main_tradeoff ? <Text style={s.muted}>Trade-off: {p.proposed.journey.main_tradeoff}</Text> : null}
            <Pressable onPress={() => approve(p.id)} disabled={!!busy || !approver.trim()} style={({ pressed }) => [s.primaryButton, { backgroundColor: C.alert, marginTop: 4 }, (pressed || busy === p.id) && s.pressed]}>
              <Text style={[s.primaryButtonText, { color: C.text }]}>{busy === p.id ? "Approving…" : `Approve for ${p.person_name}`}</Text>
            </Pressable>
          </View>
        ))}
      </View>
      {error ? <Text style={s.redBox}>{error}</Text> : null}
    </ScrollView>
  );
}
