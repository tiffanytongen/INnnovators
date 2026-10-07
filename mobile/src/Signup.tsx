// Ticket checkout step (not an account): name/language come from the ticket; 3 optional journey questions.
// The server creates the attendee profile, asks Claude for their Plan A now and prepares disruption plans in the background.
import { useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { postJSON, s } from "./theme";
import { Btn, Card, Chips, Field, Notice, Toggle, Txt, usePal } from "./ui";

const LANGS: [string, string][] = [["en", "English"], ["zh", "中文"], ["vi", "Tiếng Việt"], ["ar", "العربية"], ["hi", "हिन्दी"], ["es", "Español"], ["ko", "한국어"]];
const LINES = ["Sandringham", "Frankston", "Belgrave", "Lilydale", "Craigieburn", "Werribee", "Hurstbridge", "Pakenham"];
const ZONES: [string, string][] = [["pickup_zone_1", "Zone 1 · Gate A"], ["pickup_zone_2", "Zone 2 · Gate B"], ["pickup_zone_3", "Zone 3 · Gate D"]];

export default function Signup({ server, onDone, onCancel }: { server: string; onDone: (id: string) => void; onCancel: () => void }) {
  const p = usePal();
  const [f, setF] = useState({ name: "", lang: "en", suburb: "", mode: "train", line: "Sandringham", zone: "pickup_zone_2", contact: "parent", step_free: false, leave_by: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v });

  async function submit() {
    if (!f.name.trim()) return setError("Add the name on the ticket.");
    if (f.leave_by && !/^\d{2}:\d{2}$/.test(f.leave_by)) return setError("Use a time like 23:15, or leave it blank.");
    setBusy(true);
    setError("");
    try {
      const { id } = await postJSON<{ id: string }>(`${server}/api/profile`, { ...f, wheelchair: false, age: 20, group_size: 1 }, 90000);
      onDone(id);
    } catch (e) {
      setError(e instanceof Error && !e.message.includes("abort") ? e.message : `Can't reach the Plan B server at ${server}.`);
      setBusy(false);
    }
  }

  if (busy)
    return (
      <View style={{ flex: 1, backgroundColor: p.bg, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 }}>
        <ActivityIndicator size="large" color={p.accent} />
        <Txt k="headline" style={{ textAlign: "center" }}>Preparing your journey home…</Txt>
        <Txt c="sub" style={{ textAlign: "center" }}>About 20 seconds. Alternatives for storms, closures and delays are prepared in the background.</Txt>
      </View>
    );

  return (
    <ScrollView style={{ backgroundColor: p.bg }} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <View style={{ backgroundColor: p.band, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 28, gap: 6 }}>
        <Btn kind="ghost" title="‹ Back" onPress={onCancel} style={{ alignSelf: "flex-start", minHeight: 36 }} />
        <Txt k="eyebrow" c="sub">Ticket checkout · step 3 of 4</Txt>
        <Txt k="title">Getting home after Fieldday</Txt>
        <Txt c="sub">3 optional questions at checkout. Plan B combines your ticket details with these to plan your way home, and a safer one if conditions change. No extra app.</Txt>
      </View>

      <View style={{ padding: 20, gap: 22 }}>
        <Card>
          <Txt k="small" c="sub">From your ticket</Txt>
          <Field value={f.name} onChangeText={(v) => set("name", v)} placeholder="Name on ticket" />
          <Chips options={LANGS} value={f.lang} onChange={(v) => set("lang", v)} />
        </Card>

        <View style={{ gap: 10 }}>
          <Txt k="bodyStrong">1. Where are you heading after?</Txt>
          <Field value={f.suburb} onChangeText={(v) => set("suburb", v)} placeholder="Suburb or postcode, e.g. Sandringham 3191" />
        </View>

        <View style={{ gap: 10 }}>
          <Txt k="bodyStrong">2. How are you getting home?</Txt>
          <Chips options={[["train", "Train"], ["shuttle", "Festival shuttle"], ["pickup", "Someone's picking me up"]]} value={f.mode} onChange={(v) => set("mode", v)} />
          {f.mode === "train" && <Chips options={LINES.map((l) => [l, l])} value={f.line} onChange={(v) => set("line", v)} />}
          {f.mode === "pickup" && (
            <>
              <Chips options={ZONES} value={f.zone} onChange={(v) => set("zone", v)} />
              <Chips options={[["parent", "Parent"], ["friend", "Friend"], ["partner", "Partner"]]} value={f.contact} onChange={(v) => set("contact", v)} />
            </>
          )}
        </View>

        <View style={{ gap: 4 }}>
          <Txt k="bodyStrong">3. Anything that affects how you travel?</Txt>
          <Toggle label="I need step-free routes" on={f.step_free} onPress={() => set("step_free", !f.step_free)} />
          <View style={[s.row, { marginTop: 10 }]}>
            <Txt style={{ flex: 1 }}>Need to be on your way by (optional)</Txt>
            <Field value={f.leave_by} onChangeText={(v) => set("leave_by", v)} placeholder="23:15" keyboardType="numbers-and-punctuation" style={{ width: 96, textAlign: "center" }} />
          </View>
        </View>

        {error ? <Notice>{error}</Notice> : null}
        <Btn title="Continue to payment" onPress={submit} />
        <Txt k="small" c="sub">Used only for getting you home safely, and deleted after the event. Medical needs are handled by staff at the info tents, not by Plan B.</Txt>
      </View>
    </ScrollView>
  );
}
