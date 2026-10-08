// "Contact phone" demo view: what the attendee's emergency/pickup contact would see. A simulated iPhone lock
// screen that receives the pickup text, and a Messages-style thread when it's tapped. Nothing is really sent;
// it only shows texts generated for the contact saved on that attendee's Details page.
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Banner, NoteCard, useDemoInbox, type DemoNote } from "./Notify";
import { C, F, T, getJSON, hhmm, store } from "./theme";
import { Select, Txt, usePal } from "./ui";

type Attendee = { id: string; name: string; contact: { name: string; relationship: string; phone_masked: string } | null };

const LOCK_BG = "#14142A";

export function LockScreen({ notes, onOpen, compact }: { notes: DemoNote[]; onOpen?: (n: DemoNote) => void; compact?: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);
  return (
    <View style={{ backgroundColor: LOCK_BG, borderRadius: compact ? 28 : 40, padding: compact ? 14 : 20, paddingTop: compact ? 18 : 36, gap: compact ? 8 : 12, minHeight: compact ? 0 : 560 }}>
      <View style={{ alignItems: "center", marginBottom: compact ? 4 : 16 }}>
        <Text style={{ fontFamily: F.bodySemi, fontSize: compact ? 13 : 17, color: "rgba(255,255,255,0.8)" }}>
          {now.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}
        </Text>
        <Text style={{ fontFamily: F.displayBold, fontSize: compact ? 44 : 84, lineHeight: compact ? 50 : 92, color: C.white, letterSpacing: -2 }}>{hhmm(Math.floor(now.getTime() / 1000))}</Text>
      </View>
      {notes.length === 0
        ? <Text style={[T.small, { color: "rgba(255,255,255,0.55)", textAlign: "center" }]}>No notifications</Text>
        : [...notes].reverse().slice(0, compact ? 1 : 6).map((n) => <NoteCard key={n.id} note={n} sms dark compact={compact} onPress={onOpen ? () => onOpen(n) : undefined} />)}
    </View>
  );
}

function Thread({ notes, onBack }: { notes: DemoNote[]; onBack: () => void }) {
  return (
    <View style={{ backgroundColor: C.white, borderRadius: 40, padding: 18, gap: 10, minHeight: 560 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable accessibilityRole="button" onPress={onBack} hitSlop={12}><Text style={[T.bodyStrong, { color: "#0A84FF" }]}>‹ Back</Text></Pressable>
      </View>
      <View style={{ alignItems: "center", gap: 4, marginBottom: 8 }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.purple, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: F.displayBold, fontSize: 24, color: C.white }}>F</Text>
        </View>
        <Text style={T.smallStrong}>Fieldday</Text>
        <Text style={[T.small, { fontSize: 12, color: "#8E8E93" }]}>Simulated SMS · not sent to a real phone</Text>
      </View>
      {notes.map((n) => (
        <View key={n.id} style={{ gap: 4 }}>
          <Text style={[T.small, { fontSize: 12, color: "#8E8E93", textAlign: "center" }]}>Today {hhmm(Math.floor(n.created_at / 1000))}</Text>
          <View style={{ alignSelf: "flex-start", maxWidth: "82%", backgroundColor: "#E9E9EB", borderRadius: 20, borderBottomLeftRadius: 6, paddingHorizontal: 14, paddingVertical: 10 }}>
            <Text style={[T.body, { fontSize: 16, lineHeight: 22, color: C.ink }]}>{n.body}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export default function ContactPhone({ server }: { server: string }) {
  const p = usePal();
  const [attendees, setAttendees] = useState<Attendee[] | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const [thread, setThread] = useState(false);
  const { notes, incoming, clearIncoming } = useDemoInbox(server, personId, "contact");

  useEffect(() => {
    const load = () => getJSON<{ attendees: Attendee[] }>(`${server}/api/demo`, 5000).then(async (r) => {
      const withContact = r.attendees.filter((a) => a.contact);
      setAttendees(withContact);
      const saved = await store.get<string>("planb:contactphone");
      setPersonId((cur) => cur ?? (withContact.find((a) => a.id === saved) ?? withContact[0])?.id ?? null);
    }, () => setAttendees([]));
    load();
    const id = setInterval(load, 10000); // pick up contacts saved on other phones
    return () => clearInterval(id);
  }, [server]);

  const who = attendees?.find((a) => a.id === personId);
  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ backgroundColor: p.bg }} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
        <Txt k="small" c="sub">{"Demo · the simulated phone of an attendee's saved contact"}</Txt>
        {attendees && attendees.length > 0 ? (
          <Select
            options={attendees.map((a) => [a.id, `${a.contact!.name} (${a.contact!.relationship} of ${a.name})`])}
            value={personId ?? ""}
            onChange={(v) => { setPersonId(v); setThread(false); store.set("planb:contactphone", v); }}
          />
        ) : (
          <Txt c="sub">{attendees ? "No attendee has saved an emergency/pickup contact yet. Add one on the Details page." : "Loading…"}</Txt>
        )}
        {who && <Txt k="small" c="sub">{who.contact!.name} · {who.contact!.phone_masked}</Txt>}
        {thread ? <Thread notes={notes} onBack={() => setThread(false)} /> : <LockScreen notes={notes} onOpen={() => setThread(true)} />}
      </ScrollView>
      {incoming && <Banner key={incoming.id} note={incoming} sms onOpen={() => setThread(true)} onDone={clearIncoming} />}
    </View>
  );
}
