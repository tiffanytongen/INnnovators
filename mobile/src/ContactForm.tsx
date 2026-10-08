// "Emergency & Pickup Contact" section of the attendee Details page (ticket checkout), and the screen to edit it later.
// Optional for everyone. The server keeps only a masked number; the demo never texts a real phone.
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { C, F, getJSON, s } from "./theme";
import { Btn, Card, Field, Notice, Select, Txt, usePal } from "./ui";

export const RELATIONSHIPS = ["Parent", "Guardian", "Family Member", "Friend", "Other"];
export type ContactInput = { name: string; relationship: string; phone: string; email: string; agreed: boolean };
export const emptyContact = (): ContactInput => ({ name: "", relationship: "Parent", phone: "", email: "", agreed: false });
type Saved = { name: string; relationship: string; phone_masked: string; email_masked?: string; attendee_agreed: boolean } | null;

export function ContactFields({ value, onChange, saved }: { value: ContactInput; onChange: (v: ContactInput) => void; saved?: Saved }) {
  const p = usePal();
  const set = <K extends keyof ContactInput>(k: K, v: ContactInput[K]) => onChange({ ...value, [k]: v });
  return (
    <Card style={{ gap: 10 }}>
      <Txt k="bodyStrong">Emergency & Pickup Contact</Txt>
      <Txt k="small" c="sub">Optional. Someone we can update if your plans change, or who is collecting you.</Txt>
      <Field value={value.name} onChangeText={(v) => set("name", v)} placeholder="Contact name" />
      <Select options={RELATIONSHIPS.map((r) => [r, r])} value={value.relationship} onChange={(v) => set("relationship", v)} />
      <Field value={value.phone} onChangeText={(v) => set("phone", v)} placeholder={saved?.phone_masked ? `${saved.phone_masked} (leave blank to keep)` : "Mobile with country code, e.g. +61 412 345 678"} keyboardType="phone-pad" />
      <Field value={value.email} onChangeText={(v) => set("email", v)} placeholder={saved?.email_masked ? `${saved.email_masked} (leave blank to keep)` : "Email (optional)"} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: value.agreed }} onPress={() => set("agreed", !value.agreed)} style={({ pressed }) => [{ flexDirection: "row", gap: 12, alignItems: "flex-start", paddingVertical: 6 }, pressed && s.pressed]}>
        <View style={{ width: 26, height: 26, borderRadius: 8, marginTop: 1, borderWidth: 2, borderColor: value.agreed ? p.accent : p.line, backgroundColor: value.agreed ? p.accent : p.card, alignItems: "center", justifyContent: "center" }}>
          {value.agreed ? <Text style={{ fontFamily: F.bodyBold, color: C.white, fontSize: 15 }}>✓</Text> : null}
        </View>
        <Txt k="small" style={{ flex: 1 }}>I agree to this contact receiving important event updates and pickup notifications.</Txt>
      </Pressable>
      <Txt k="small" c="sub">{"This is your agreement, not theirs: in a real rollout the contact would be asked to confirm before receiving texts. In this demo, only a masked number is kept and nothing is sent."}</Txt>
    </Card>
  );
}

/** Edit the saved contact later (attendee screen → "Emergency & pickup contact"). */
export function EditContact({ server, personId, onClose }: { server: string; personId: string; onClose: () => void }) {
  const p = usePal();
  const [saved, setSaved] = useState<Saved | undefined>(undefined);
  const [value, setValue] = useState<ContactInput>(emptyContact());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    getJSON<{ contact: Saved }>(`${server}/api/profile/${personId}`, 5000).then(
      (r) => {
        setSaved(r.contact);
        if (r.contact) setValue({ name: r.contact.name, relationship: r.contact.relationship, phone: "", email: "", agreed: r.contact.attendee_agreed });
      },
      () => { setSaved(null); setError("Can't reach the Plan B server to load your details."); },
    );
  }, [server, personId]);

  async function save(remove = false) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`${server}/api/profile/${personId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ contact: remove ? null : value }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setSaved(j.contact);
      if (remove) setValue(emptyContact());
      else setValue({ ...value, phone: "", email: "" });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: p.bg }} contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <Btn kind="ghost" title="‹ Back to my plan" onPress={onClose} style={{ alignSelf: "flex-start", minHeight: 36 }} />
      <Txt k="title">My details</Txt>
      {saved === undefined ? <ActivityIndicator color={p.accent} /> : (
        <>
          {saved ? (
            <View style={{ backgroundColor: p.card, borderRadius: 22, padding: 16, gap: 2 }}>
              <Txt k="smallStrong" c="sub">Saved contact</Txt>
              <Txt k="bodyStrong">{saved.name} · {saved.relationship}</Txt>
              <Txt k="small" c="sub">{saved.phone_masked}{saved.email_masked ? ` · ${saved.email_masked}` : ""} · {saved.attendee_agreed ? "you agreed to updates" : "no updates"}</Txt>
            </View>
          ) : <Txt c="sub">No emergency or pickup contact saved yet.</Txt>}
          <ContactFields value={value} onChange={(v) => { setValue(v); setDone(false); }} saved={saved} />
          {error ? <Notice>{error}</Notice> : null}
          {done ? <Txt k="bodyStrong" c="ok">✓ Saved</Txt> : null}
          <Btn title="Save contact" busy={busy} onPress={() => save(false)} />
          {saved ? <Btn kind="ghost" title="Remove this contact" onPress={() => save(true)} /> : null}
        </>
      )}
    </ScrollView>
  );
}
