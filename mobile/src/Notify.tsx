// Demo notifications on the phone: polling the laptop server's demo inbox (same 2-second style as Plan B
// triggers, so it works across phones and simulators), a native-looking banner that slides down, and the
// card used in the notification centre. Everything here is a simulation for the recorded demo.
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, Text, Vibration, View } from "react-native";
import { C, F, T, getJSON, hhmm, store } from "./theme";

export type DemoNote = {
  id: string;
  person_id: string;
  audience: "attendee" | "contact";
  scenario: "congestion" | "delay" | "pickup" | "priority";
  title: string;
  body: string;
  created_at: number;
  action: { kind: "route" } | { kind: "lineup"; set_id: string } | { kind: "pickup"; place: string };
  to?: string;
};
type Inbox = { notes: DemoNote[]; set_delays: Record<string, number> };

const isInbox = (v: unknown): v is Inbox =>
  !!v && typeof v === "object" && Array.isArray((v as Inbox).notes) && typeof (v as Inbox).set_delays === "object";

/** Notifications for one phone. `incoming` is set when a new one arrives (not for ones already there on open). */
export function useDemoInbox(server: string, personId: string | null, audience: "attendee" | "contact") {
  const [inbox, setInbox] = useState<Inbox>({ notes: [], set_delays: {} });
  const [incoming, setIncoming] = useState<DemoNote | null>(null);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!personId) return;
    let active = true;
    seen.current = null;
    const key = `planb:inbox:${audience}:${personId}`;
    store.get<unknown>(key).then((saved) => { if (active && isInbox(saved)) setInbox(saved); });
    const poll = async () => {
      try {
        const r = await getJSON<unknown>(`${server}/api/demo?person=${encodeURIComponent(personId)}&audience=${audience}`, 2500);
        if (!active || !isInbox(r)) return;
        if (seen.current === null) {
          seen.current = new Set(r.notes.map((n) => n.id)); // first load: list them, don't replay banners
        } else {
          const fresh = r.notes.filter((n) => !seen.current!.has(n.id));
          fresh.forEach((n) => seen.current!.add(n.id));
          if (fresh.length) {
            setIncoming(fresh[fresh.length - 1]);
            Vibration.vibrate(400);
          }
        }
        setInbox(r);
        store.set(key, r);
      } catch {
        // offline: keep what's saved
      }
    };
    poll();
    const id = setInterval(poll, 1500);
    return () => { active = false; clearInterval(id); };
  }, [server, personId, audience]);

  const clearIncoming = useCallback(() => setIncoming(null), []);
  return { notes: inbox.notes, setDelays: inbox.set_delays, incoming, clearIncoming };
}

const ago = (ms: number) => (Date.now() - ms < 60000 ? "now" : hhmm(Math.floor(ms / 1000)));

// Small square app icon: "F" for Fieldday (Messages-green for SMS).
export function AppIcon({ sms, size = 38 }: { sms?: boolean; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.26, backgroundColor: sms ? "#34C759" : C.purple, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: F.displayBold, fontSize: size * 0.48, color: C.white }}>{sms ? "✉" : "F"}</Text>
    </View>
  );
}

/** A native-looking notification card. `dark` = on a lock screen. */
export function NoteCard({ note, sms, dark, onPress, compact }: { note: DemoNote; sms?: boolean; dark?: boolean; onPress?: () => void; compact?: boolean }) {
  const fg = dark ? C.white : C.ink;
  const sub = dark ? "rgba(255,255,255,0.7)" : "#6B6B78";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [{
        flexDirection: "row", gap: 12, alignItems: "flex-start", padding: compact ? 12 : 14, borderRadius: 24,
        backgroundColor: dark ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.96)",
        shadowColor: "#000", shadowOpacity: dark ? 0 : 0.14, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 6,
      }, pressed && { opacity: 0.85 }]}
    >
      <AppIcon sms={sms} size={compact ? 30 : 38} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
          <Text style={[T.smallStrong, { color: fg, flex: 1 }]} numberOfLines={1}>{sms ? "Fieldday · Simulated SMS" : note.title}</Text>
          <Text style={[T.small, { color: sub, fontSize: 13 }]}>{ago(note.created_at)}</Text>
        </View>
        <Text style={[T.small, { color: fg, fontSize: compact ? 13 : 15, lineHeight: compact ? 18 : 20 }]} numberOfLines={compact ? 3 : 4}>{note.body}</Text>
      </View>
    </Pressable>
  );
}

/** Slides down from the top, stays ~6 s, slides away. Tap to open. Re-mounts (key) for each new note. */
export function Banner({ note, sms, dark, onOpen, onDone }: { note: DemoNote; sms?: boolean; dark?: boolean; onOpen: () => void; onDone: () => void }) {
  const [y] = useState(() => new Animated.Value(-180));
  useEffect(() => {
    const slideIn = Animated.spring(y, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 160 });
    slideIn.start();
    const t = setTimeout(() => Animated.timing(y, { toValue: -180, duration: 260, useNativeDriver: true }).start(() => onDone()), 6000);
    return () => { clearTimeout(t); slideIn.stop(); };
  }, [y, onDone]);
  return (
    <Animated.View style={{ position: "absolute", top: 6, left: 10, right: 10, zIndex: 50, transform: [{ translateY: y }] }}>
      <NoteCard note={note} sms={sms} dark={dark} onPress={() => { onOpen(); onDone(); }} />
    </Animated.View>
  );
}
