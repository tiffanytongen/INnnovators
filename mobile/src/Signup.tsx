// 30-second sign-up (from the ticket email link in real life). Creates the attendee's profile on the server,
// which asks Claude for their Plan A straight away and prepares the disruption plans in the background.
import { useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { s, postJSON } from "./theme";
import { Btn, Chips, Field, Label, Notice, Toggle, Txt, usePal } from "./ui";

const LANGS: [string, string][] = [["en", "English"], ["zh", "中文"], ["vi", "Tiếng Việt"], ["ar", "العربية"], ["hi", "हिन्दी"], ["es", "Español"], ["ko", "한국어"]];
const LINES = ["Sandringham", "Frankston", "Belgrave", "Lilydale", "Craigieburn", "Werribee", "Hurstbridge", "Pakenham"];
const ZONES: [string, string][] = [["pickup_zone_1", "Zone 1 · Gate A"], ["pickup_zone_2", "Zone 2 · Gate B"], ["pickup_zone_3", "Zone 3 · Gate D (accessible)"]];

export default function Signup({ server, onDone, onCancel }: { server: string; onDone: (id: string) => void; onCancel: () => void }) {
  const p = usePal();
  const [f, setF] = useState({ name: "", age: "", lang: "en", mode: "train", line: "Sandringham", zone: "pickup_zone_2", contact: "parent", group_size: 1, wheelchair: false, step_free: false, first_timer: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v });

  async function submit() {
    if (!f.name.trim() || !f.age.trim()) return setError("Add your first name and age.");
    setBusy(true);
    setError("");
    try {
      const { id } = await postJSON<{ id: string }>(`${server}/api/profile`, f, 90000);
      onDone(id);
    } catch (e) {
      setError(e instanceof Error && !e.message.includes("abort") ? e.message : `Can't reach the Plan B server at ${server}.`);
      setBusy(false);
    }
  }

  if (busy)
    return (
      <View style={[s.gutter, { flex: 1, justifyContent: "center", gap: 16 }]}>
        <ActivityIndicator size="large" color={p.accent} style={{ alignSelf: "flex-start" }} />
        <Txt k="title">Making your plan, {f.name}…</Txt>
        <Txt c="sub">AI is working out your best way home tonight. About 20 seconds. Your plans for storms, closures and delays are prepared in the background.</Txt>
      </View>
    );

  return (
    <ScrollView contentContainerStyle={{ paddingVertical: 16, gap: 24, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <View style={[s.gutter, { alignItems: "flex-start" }]}>
        <Btn kind="ghost" title="← Back" onPress={onCancel} style={{ paddingHorizontal: 0, minHeight: 44 }} />
        <Txt k="title" style={{ fontSize: 40, lineHeight: 48 }}>Your Plan B</Txt>
        <Txt c="sub" style={{ marginTop: 6 }}>30 seconds. We use this to plan your way home tonight, and what to do if things change.</Txt>
      </View>

      <View style={[s.gutter, { flexDirection: "row", gap: 10 }]}>
        <Field value={f.name} onChangeText={(v) => set("name", v)} placeholder="First name" accessibilityLabel="First name" style={{ flex: 1 }} />
        <Field value={f.age} onChangeText={(v) => set("age", v.replace(/\D/g, ""))} placeholder="Age" accessibilityLabel="Age" keyboardType="number-pad" style={{ width: 84 }} />
      </View>

      <View style={[s.gutter, { gap: 10 }]}>
        <Label>Language</Label>
        <Chips options={LANGS} value={f.lang} onChange={(v) => set("lang", v)} />
      </View>

      <View style={[s.gutter, { gap: 10 }]}>
        <Label>How are you getting home?</Label>
        <Chips options={[["train", "Train"], ["shuttle", "Shuttle"], ["pickup", "Pickup"]]} value={f.mode} onChange={(v) => set("mode", v)} />
        {f.mode === "train" && <Chips options={LINES.map((l) => [l, l])} value={f.line} onChange={(v) => set("line", v)} />}
        {f.mode === "pickup" && (
          <>
            <Chips options={ZONES} value={f.zone} onChange={(v) => set("zone", v)} />
            <Chips options={[["parent", "Parent"], ["friend", "Friend"], ["partner", "Partner"]]} value={f.contact} onChange={(v) => set("contact", v)} />
          </>
        )}
      </View>

      <View style={[s.gutter, { gap: 4 }]}>
        <Label>About you</Label>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 60, borderBottomWidth: 1, borderBottomColor: p.line }}>
          <Txt k="bodyStrong" style={{ flex: 1 }}>People in your group</Txt>
          <Btn kind="line" title="−" right="" onPress={() => set("group_size", Math.max(1, f.group_size - 1))} style={{ minHeight: 44, width: 52, paddingHorizontal: 14 }} />
          <Txt k="huge" style={{ width: 40, textAlign: "center", fontSize: 40, lineHeight: 42 }}>{f.group_size}</Txt>
          <Btn kind="line" title="+" right="" onPress={() => set("group_size", Math.min(12, f.group_size + 1))} style={{ minHeight: 44, width: 52, paddingHorizontal: 14 }} />
        </View>
        <Toggle label="I use a wheelchair" on={f.wheelchair} onPress={() => set("wheelchair", !f.wheelchair)} />
        <Toggle label="I need step-free routes" on={f.step_free} onPress={() => set("step_free", !f.step_free)} />
        <Toggle label="It's my first festival" on={f.first_timer} onPress={() => set("first_timer", !f.first_timer)} />
      </View>

      <View style={[s.gutter, { gap: 12 }]}>
        {error ? <Notice>{error}</Notice> : null}
        <Btn title="Make my plan" onPress={submit} />
        <Txt k="small" c="sub">Your plans are saved on your phone. Data is deleted after the event. Medical needs? Tell the info tent: staff handle those, not the app.</Txt>
      </View>
    </ScrollView>
  );
}
