// Shared colours, styles and network helpers for both the Participant and Organizer sides.
import { StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

export const C = {
  bg: "#F5F4F0",
  card: "#FFFFFF",
  line: "#E7E4DD",
  text: "#141414",
  muted: "#6B6862",
  green: "#15803D",
  greenBg: "#E7F6EC",
  alert: "#FFD400",
  red: "#DC2626",
};

// The laptop running `npm start`: same IP Expo Go loaded this app from, port 3000.
export function defaultServer() {
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return host ? `http://${host}:${Constants.expoConfig?.extra?.serverPort ?? 3000}` : "http://localhost:3000";
}

export async function getJSON<T>(url: string, ms = 3000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "cache-control": "no-store" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export const store = {
  async get<T>(k: string): Promise<T | null> {
    try {
      const v = await AsyncStorage.getItem(k);
      return v ? (JSON.parse(v) as T) : null;
    } catch {
      return null;
    }
  },
  set: (k: string, v: unknown) => AsyncStorage.setItem(k, JSON.stringify(v)).catch(() => {}),
};

export const hhmm = (unix: number) => {
  const d = new Date(unix * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export async function postJSON<T>(url: string, body: unknown, ms = 60000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { method: "POST", signal: ctrl.signal, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
    return j as T;
  } finally {
    clearTimeout(t);
  }
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  brand: { color: C.text, fontSize: 44, fontWeight: "900" },
  hello: { color: C.text, fontSize: 30, fontWeight: "800" },
  h1: { color: C.text, fontSize: 30, fontWeight: "800", lineHeight: 38, marginTop: 4 },
  h2: { color: C.text, fontSize: 22, fontWeight: "700" },
  sub: { color: C.muted, fontSize: 17, marginTop: 6 },
  body: { color: C.text, fontSize: 17, lineHeight: 24 },
  muted: { color: C.muted, fontSize: 15, lineHeight: 21 },
  tiny: { color: C.muted, fontSize: 12 },
  sectionLabel: { color: C.muted, fontSize: 13, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" },
  link: { color: C.text, fontSize: 16, fontWeight: "700", textDecorationLine: "underline" },
  smallLink: { color: C.muted, fontSize: 14, textDecorationLine: "underline" },
  card: { backgroundColor: C.card, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: C.line },
  cardTitle: { color: C.text, fontSize: 18, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  pressed: { opacity: 0.75 },
  chevron: { color: C.muted, fontSize: 28 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.alert, alignItems: "center", justifyContent: "center" },
  avatarText: { color: C.text, fontSize: 22, fontWeight: "900" },
  gateBadge: { width: 56, height: 56, borderRadius: 14, backgroundColor: C.text, alignItems: "center", justifyContent: "center" },
  gateLetter: { color: "#fff", fontSize: 32, fontWeight: "900" },
  time: { color: C.text, fontSize: 24, fontWeight: "900" },
  signalPill: { backgroundColor: C.greenBg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  signalPillText: { color: C.green, fontSize: 13, fontWeight: "700" },
  alertCard: { backgroundColor: C.alert, borderRadius: 20, padding: 18, gap: 8 },
  alertTitle: { color: C.text, fontSize: 18, fontWeight: "900" },
  alertBody: { color: C.text, fontSize: 20, fontWeight: "700", lineHeight: 27 },
  alertCta: { color: C.text, fontSize: 16, fontWeight: "800", marginTop: 4 },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 12 },
  back: { color: C.text, fontSize: 18, fontWeight: "700" },
  tag: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  tagText: { fontSize: 13, fontWeight: "800" },
  offlineBar: { backgroundColor: "#EDEBE6", color: C.text, paddingHorizontal: 20, paddingVertical: 8, fontSize: 14, fontWeight: "600" },
  badge: { backgroundColor: C.card, borderColor: C.line, borderWidth: 1, color: C.text, borderRadius: 14, overflow: "hidden", paddingHorizontal: 16, paddingVertical: 12, fontSize: 17, fontWeight: "600" },
  redBox: { backgroundColor: C.red, color: "#fff", borderRadius: 14, overflow: "hidden", padding: 14, fontSize: 17, fontWeight: "800" },
  noteBox: { borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 10, color: C.muted, fontSize: 14 },
  footer: { padding: 16, gap: 6, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.line },
  primaryButton: { backgroundColor: C.text, borderRadius: 18, paddingVertical: 16, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  secondaryButton: { backgroundColor: C.card, borderColor: C.line, borderWidth: 1, borderRadius: 14, paddingHorizontal: 18, justifyContent: "center" },
  secondaryButtonText: { color: C.text, fontSize: 16, fontWeight: "700" },
  input: { backgroundColor: C.card, borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 12, color: C.text, fontSize: 16 },
});
