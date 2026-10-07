// 30-second sign-up (from the ticket email link in real life). Creates the attendee's profile on the server,
// which asks Claude for their Plan A straight away and prepares the disruption plans in the background.
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { C, s, postJSON } from "./theme";

const LANGS: [string, string][] = [["en", "English"], ["zh", "中文"], ["vi", "Tiếng Việt"], ["ar", "العربية"], ["hi", "हिन्दी"], ["es", "Español"], ["ko", "한국어"]];
const LINES = ["Sandringham", "Frankston", "Belgrave", "Lilydale", "Craigieburn", "Werribee", "Hurstbridge", "Pakenham"];
const ZONES: [string, string][] = [["pickup_zone_1", "Zone 1 · Gate A"], ["pickup_zone_2", "Zone 2 · Gate B"], ["pickup_zone_3", "Zone 3 · Gate D (accessible)"]];

function Chips({ options, value, onChange }: { options: [string, string][]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map(([v, l]) => (
        <Pressable key={v} onPress={() => onChange(v)} style={[s.tag, { paddingHorizontal: 14, paddingVertical: 9, backgroundColor: value === v ? C.text : C.card, borderWidth: 1, borderColor: value === v ? C.text : C.line }]}>
          <Text style={{ color: value === v ? "#fff" : C.text, fontWeight: "700", fontSize: 15 }}>{l}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Toggle({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.card, s.row, { paddingVertical: 14 }, on && { borderColor: C.text, borderWidth: 2 }]}>
      <Text style={[s.cardTitle, { flex: 1, fontSize: 17 }]}>{label}</Text>
      <View style={{ width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: on ? C.text : C.line, backgroundColor: on ? C.text : "transparent", alignItems: "center", justifyContent: "center" }}>
        {on && <Text style={{ color: "#fff", fontWeight: "900" }}>✓</Text>}
      </View>
    </Pressable>
  );
}

export default function Signup({ server, onDone, onCancel }: { server: string; onDone: (id: string) => void; onCancel: () => void }) {
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
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 }}>
        <ActivityIndicator size="large" color={C.text} />
        <Text style={[s.h2, { textAlign: "center" }]}>Making your plan, {f.name}…</Text>
        <Text style={[s.muted, { textAlign: "center" }]}>AI is working out your best way home tonight. About 20 seconds. Your plans for storms, closures and delays are prepared in the background.</Text>
      </View>
    );

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Pressable onPress={onCancel} hitSlop={12}><Text style={s.back}>‹ Back</Text></Pressable>
      <View>
        <Text style={s.hello}>Your Plan B</Text>
        <Text style={s.muted}>30 seconds. We use this to plan your way home tonight, and what to do if things change.</Text>
      </View>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <TextInput value={f.name} onChangeText={(v) => set("name", v)} placeholder="First name" placeholderTextColor="#9A968E" style={[s.input, { flex: 1 }]} />
        <TextInput value={f.age} onChangeText={(v) => set("age", v.replace(/\D/g, ""))} placeholder="Age" keyboardType="number-pad" placeholderTextColor="#9A968E" style={[s.input, { width: 80 }]} />
      </View>

      <View style={{ gap: 8 }}>
        <Text style={s.sectionLabel}>Language</Text>
        <Chips options={LANGS} value={f.lang} onChange={(v) => set("lang", v)} />
      </View>

      <View style={{ gap: 8 }}>
        <Text style={s.sectionLabel}>How are you getting home?</Text>
        <Chips options={[["train", "🚆 Train"], ["shuttle", "🚌 Shuttle"], ["pickup", "🚗 Pickup"]]} value={f.mode} onChange={(v) => set("mode", v)} />
        {f.mode === "train" && <Chips options={LINES.map((l) => [l, l])} value={f.line} onChange={(v) => set("line", v)} />}
        {f.mode === "pickup" && (
          <>
            <Chips options={ZONES} value={f.zone} onChange={(v) => set("zone", v)} />
            <Chips options={[["parent", "Parent"], ["friend", "Friend"], ["partner", "Partner"]]} value={f.contact} onChange={(v) => set("contact", v)} />
          </>
        )}
      </View>

      <View style={[s.card, s.row, { paddingVertical: 12 }]}>
        <Text style={[s.cardTitle, { flex: 1, fontSize: 17 }]}>People in your group</Text>
        <Pressable onPress={() => set("group_size", Math.max(1, f.group_size - 1))} style={s.secondaryButton}><Text style={s.secondaryButtonText}>−</Text></Pressable>
        <Text style={[s.cardTitle, { width: 28, textAlign: "center" }]}>{f.group_size}</Text>
        <Pressable onPress={() => set("group_size", Math.min(12, f.group_size + 1))} style={s.secondaryButton}><Text style={s.secondaryButtonText}>+</Text></Pressable>
      </View>

      <View style={{ gap: 8 }}>
        <Toggle label="I use a wheelchair" on={f.wheelchair} onPress={() => set("wheelchair", !f.wheelchair)} />
        <Toggle label="I need step-free routes" on={f.step_free} onPress={() => set("step_free", !f.step_free)} />
        <Toggle label="It's my first festival" on={f.first_timer} onPress={() => set("first_timer", !f.first_timer)} />
      </View>

      {error ? <Text style={s.redBox}>{error}</Text> : null}
      <Pressable onPress={submit} style={({ pressed }) => [s.primaryButton, { backgroundColor: C.alert }, pressed && s.pressed]}>
        <Text style={[s.primaryButtonText, { color: C.text }]}>Make my plan</Text>
      </Pressable>
      <Text style={s.tiny}>Your plans are saved on your phone. Data is deleted after the event. Medical needs? Tell the info tent: staff handle those, not the app.</Text>
    </ScrollView>
  );
}
