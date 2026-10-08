// Organizer → "Demo" (discreet button by the tabs): trigger simulated notifications for one attendee,
// for the recorded demo. Each one is generated on the server from that attendee's saved profile, plan,
// must-see artists and contact, and arrives on the right phone ~2 s later. Nothing is detected live or sent for real.
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { LockScreen, type DemoNote } from "./Notify";
import { C, F, getJSON, postJSON, s, store } from "./theme";
import { Btn, Select, Txt, onTile, usePal } from "./ui";

type Scenario = DemoNote["scenario"];
type Attendee = {
  id: string; name: string; must_see: string[];
  contact: { name: string; relationship: string; phone_masked: string; attendee_agreed: boolean } | null;
  unavailable: Record<Scenario, string | null>;
};

const SCENARIOS: { key: Scenario; label: string; color: string; glyph: string; what: string }[] = [
  { key: "congestion", label: "A · Crowd congestion", color: C.pink, glyph: "!", what: "Simulated input: marks the path on their current plan as heavily congested. Their phone re-routes around it." },
  { key: "delay", label: "B · Schedule change", color: C.yellow, glyph: "+", what: "Simulated input: their next performance runs 20 minutes late. Their lineup updates." },
  { key: "pickup", label: "C · Pickup notification", color: C.green, glyph: "✉", what: "Texts their saved pickup contact (simulated SMS, previewed below), not the attendee." },
  { key: "priority", label: "D · Priority artist", color: C.purple, glyph: "★", what: "Reminds them their must-see artist starts in 15 minutes, with directions." },
];

export default function DemoControls({ server, onClose }: { server: string; onClose: () => void }) {
  const p = usePal();
  const [attendees, setAttendees] = useState<Attendee[] | null>(null);
  const [recent, setRecent] = useState<DemoNote[]>([]);
  const [personId, setPersonId] = useState<string>("");
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [lastSms, setLastSms] = useState<DemoNote | null>(null);

  const load = useCallback(() => getJSON<{ attendees: Attendee[]; recent: DemoNote[] }>(`${server}/api/demo`, 8000).then(async (r) => {
    setAttendees(r.attendees);
    setRecent(r.recent);
    const saved = await store.get<string>("planb:demo:person");
    setPersonId((cur) => cur || (r.attendees.find((a) => a.id === saved) ?? r.attendees[0])?.id || "");
  }), [server]);
  useEffect(() => { load().catch((e) => setError(String(e))); }, [load]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  const who = attendees?.find((a) => a.id === personId);

  async function fire(sc: Scenario) {
    if (!who) return;
    setBusy(sc);
    setError("");
    try {
      const r = await postJSON<{ note: DemoNote }>(`${server}/api/demo`, { action: "trigger", person_id: who.id, scenario: sc }, 10000);
      setToast(sc === "pickup" ? `Demo notification triggered · simulated SMS to ${who.contact?.name}` : `Demo notification triggered · arrives on ${who.name}'s phone in 2 s`);
      if (sc === "pickup") setLastSms(r.note);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  async function reset() {
    setBusy("reset");
    try {
      await postJSON(`${server}/api/demo`, { action: "reset" });
      setLastSms(null);
      setToast("Demo reset: alerts cleared, paths clear, set times restored");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <View style={[s.shadow, { position: "absolute", left: 0, right: 0, bottom: 0, top: 54, backgroundColor: p.bg, borderTopLeftRadius: 32, borderTopRightRadius: 32, shadowOpacity: 0.18, elevation: 12 }]}>
      <View style={{ alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: p.line, marginTop: 10 }} />
      <View style={[s.between, { paddingHorizontal: 20, paddingTop: 8 }]}>
        <View style={{ flex: 1 }}>
          <Txt k="headline">Demo controls</Txt>
          <Txt k="small" c="sub">Simulated inputs for the recording. Nothing is detected live or sent for real.</Txt>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close demo controls" onPress={onClose} hitSlop={12} style={({ pressed }) => [{ width: 40, height: 40, borderRadius: 20, backgroundColor: p.card, alignItems: "center", justifyContent: "center" }, pressed && s.pressed]}>
          <Txt k="bodyStrong">✕</Txt>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 60 }}>
        {toast ? (
          <View style={{ backgroundColor: C.ink, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 }}>
            <Text style={{ fontFamily: F.bodySemi, fontSize: 14, color: C.white }}>✓ {toast}</Text>
          </View>
        ) : null}

        <Txt k="smallStrong" c="sub">Send to attendee</Txt>
        {attendees ? (
          <Select options={attendees.map((a) => [a.id, a.name])} value={personId} onChange={(v) => { setPersonId(v); setLastSms(null); store.set("planb:demo:person", v); }} />
        ) : <Txt c="sub">Loading attendees…</Txt>}
        {who && (
          <View style={{ backgroundColor: p.card, borderRadius: 20, padding: 14, gap: 2 }}>
            <Txt k="small" c="sub">Must-see: {who.must_see.length ? who.must_see.join(", ") : "none saved"}</Txt>
            <Txt k="small" c="sub">Contact: {who.contact ? `${who.contact.name} (${who.contact.relationship}) · ${who.contact.phone_masked}` : "none saved"}</Txt>
          </View>
        )}

        {who && SCENARIOS.map((x) => {
          const why = who.unavailable[x.key];
          return (
            <View key={x.key} style={{ backgroundColor: p.card, borderRadius: 26, padding: 16, gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: x.color, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontFamily: F.bodyBold, fontSize: 18, color: onTile(x.color) }}>{x.glyph}</Text>
                </View>
                <Txt k="bodyStrong" style={{ flex: 1 }}>{x.label}</Txt>
              </View>
              <Txt k="small" c="sub">{x.what}</Txt>
              {x.key === "pickup" && who.contact && (
                <View style={{ backgroundColor: p.raised, borderRadius: 18, padding: 12, gap: 2 }}>
                  <Txt k="smallStrong">To {who.contact.name} · {who.contact.relationship}</Txt>
                  <Txt k="small" c="sub">{who.contact.phone_masked}</Txt>
                  <Txt k="small" c="sub">{who.contact.attendee_agreed ? `${who.name} agreed to updates. ${who.contact.name} hasn't confirmed (a real rollout would ask them first).` : `${who.name} didn't agree to updates for this contact.`}</Txt>
                </View>
              )}
              {why ? <Txt k="small" c="danger">{why}</Txt> : null}
              <Btn title="Trigger notification" onPress={() => fire(x.key)} busy={busy === x.key} disabled={!!why || !!busy} style={{ minHeight: 48 }} />
              {x.key === "pickup" && lastSms && lastSms.person_id === who.id && (
                <View style={{ gap: 6 }}>
                  <Txt k="small" c="sub">Simulated SMS · what {who.contact?.name} sees</Txt>
                  <LockScreen notes={[lastSms]} compact />
                </View>
              )}
            </View>
          );
        })}

        {recent.length > 0 && (
          <View style={{ gap: 4, marginTop: 4 }}>
            <Txt k="smallStrong" c="sub">Recently triggered</Txt>
            {recent.map((n) => (
              <Txt key={n.id} k="small" c="sub" numberOfLines={1}>
                {n.audience === "contact" ? `SMS to ${n.to}` : `${attendees?.find((a) => a.id === n.person_id)?.name ?? n.person_id}: ${n.title}`}
              </Txt>
            ))}
          </View>
        )}
        {error ? <Txt k="small" c="danger">{error}</Txt> : null}
        <Btn kind="line" title="Reset demo" onPress={reset} busy={busy === "reset"} />
      </ScrollView>
    </View>
  );
}

