// Compact forecast section on the organizer's Tonight screen.
// Live Meteosource forecast for the exit window → optional AI check of attendees' journeys against it →
// proposed changes that a named organizer approves before anything reaches a phone.
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { getJSON, postJSON } from "./theme";
import { Btn, Txt, usePal } from "./ui";

type Interval = { label: string; summary: string | null; precipitation: number | null; temperature: number | null; wind_speed: number | null };
type Forecast = { status: "available" | "partial" | "unavailable" | "stale"; source: string; reason: string | null; intervals: Interval[] };
type CheckResult = { person_id: string; name: string; outcome: "proposed" | "unchanged" | "staff_review" | "error"; detail: string };
type Proposal = { id: string; person_name: string; change_summary: string[]; proposed: { text_localised: string; journey?: { main_tradeoff: string } } };

const OUTCOME: Record<CheckResult["outcome"], string> = { proposed: "change proposed", unchanged: "no change needed", staff_review: "staff review", error: "error" };

export default function WeatherPanel({ server }: { server: string }) {
  const p = usePal();
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const loadProposals = useCallback(() => getJSON<{ proposals: Proposal[] }>(`${server}/api/revisions`, 8000).then((r) => setProposals(r.proposals)), [server]);
  useEffect(() => {
    getJSON<{ forecast: Forecast }>(`${server}/api/weather/forecast`, 15000).then((r) => setForecast(r.forecast), () => {});
    loadProposals().catch(() => {});
  }, [server, loadProposals]);

  const run = async (what: string, f: () => Promise<void>) => {
    setBusy(what);
    setError("");
    try { await f(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(""); }
  };

  const summary = forecast?.status === "available" || forecast?.status === "partial"
    ? forecast.intervals.map((i) => `${i.label} ${i.summary ?? ""}, ${i.temperature ?? "?"}°, ${i.precipitation ? `${i.precipitation} mm/h rain` : "no rain"}`).join(" · ")
    : forecast?.reason ?? "Loading forecast…";

  return (
    <View style={{ gap: 8 }}>
      <Txt k="headline">Weather</Txt>
      <Txt c="sub">{summary}</Txt>
      <Txt k="small" c="sub">{forecast?.source ?? "Meteosource"} · live forecast for the exit window</Txt>
      <Btn
        kind="line"
        title={busy === "check" ? "AI is checking journeys…" : "Check journeys against the forecast"}
        busy={busy === "check"}
        onPress={() => run("check", async () => {
          const r = await postJSON<{ results: CheckResult[] }>(`${server}/api/weather/check`, {}, 240000);
          setResults(r.results);
          await loadProposals();
        })}
      />
      {results && <Txt k="small" c="sub">{results.map((r) => `${r.name}: ${OUTCOME[r.outcome]}`).join(" · ")}</Txt>}
      {proposals.map((x) => (
        <View key={x.id} style={{ backgroundColor: p.soft, borderRadius: 16, padding: 16, gap: 6 }}>
          <Txt k="bodyStrong">{x.person_name}: proposed change</Txt>
          {x.change_summary.map((c) => <Txt key={c} k="small">{c}</Txt>)}
          {x.proposed.journey?.main_tradeoff ? <Txt k="small" c="sub">{x.proposed.journey.main_tradeoff}</Txt> : null}
          <Btn title="Approve change" busy={busy === x.id} onPress={() => run(x.id, async () => { await postJSON(`${server}/api/revisions/${x.id}/approve`, { approved_by: "Jess" }); await loadProposals(); })} />
        </View>
      ))}
      {error ? <Txt k="small" c="danger">{error}</Txt> : null}
    </View>
  );
}
