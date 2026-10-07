// Shared look, type and network helpers.
//
// Two identities, restored from the earlier pastel design:
//   Attendee  — warm cream with peach; deepens to coral when Plan B is active.
//   Organizer — muted pale green: calm, operational.
// Type: Jost throughout (bold, tight display headings; regular body).
import { StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

// ---- fonts (loaded in App.tsx; family name = the key passed to useFonts) ----
export const F = {
  display: "Jost_600SemiBold",
  displayBold: "Jost_700Bold",
  body: "Jost_400Regular",
  bodyMed: "Jost_500Medium",
  bodySemi: "Jost_600SemiBold",
  bodyBold: "Jost_700Bold",
};

// ---- palettes ----
export type Pal = {
  name: "attendee" | "planb" | "organizer";
  bg: string; // screen
  band: string; // header band
  card: string;
  raised: string; // inputs, inner panels
  ink: string;
  sub: string; // secondary text (≥4.5:1 on bg and card)
  line: string;
  accent: string; // the one primary action colour
  onAccent: string;
  soft: string; // tinted highlight behind key info
  danger: string;
  ok: string;
};

export const ATTENDEE: Pal = {
  name: "attendee",
  bg: "#FBF6F1",
  band: "#FCE6D8",
  card: "#FFFFFF",
  raised: "#F8EEE6",
  ink: "#2B1E1A",
  sub: "#6B5650",
  line: "#EFE2D9",
  accent: "#B4472F",
  onAccent: "#FFFFFF",
  soft: "#FFF1E8",
  danger: "#B33A2B",
  ok: "#2F7A4E",
};

// Plan B active: same family, the band deepens to coral so the change is obvious without shouting.
export const PLANB: Pal = { ...ATTENDEE, name: "planb", band: "#FFCDBB", soft: "#FFE3DA" };

export const ORGANIZER: Pal = {
  name: "organizer",
  bg: "#F4F8F3",
  band: "#D6EBD9",
  card: "#FFFFFF",
  raised: "#EEF5EE",
  ink: "#1E2B23",
  sub: "#56655B",
  line: "#E1EAE2",
  accent: "#2F7A4E",
  onAccent: "#FFFFFF",
  soft: "#E6F2E8",
  danger: "#B33A2B",
  ok: "#2F7A4E",
};

// ---- type scale (no colours: components apply the palette) ----
export const T = StyleSheet.create({
  mega: { fontFamily: F.displayBold, fontSize: 64, lineHeight: 68, letterSpacing: -1.5 },
  huge: { fontFamily: F.displayBold, fontSize: 40, lineHeight: 44, letterSpacing: -0.8 },
  title: { fontFamily: F.displayBold, fontSize: 30, lineHeight: 35, letterSpacing: -0.4 },
  headline: { fontFamily: F.display, fontSize: 22, lineHeight: 28 },
  big: { fontFamily: F.bodySemi, fontSize: 18, lineHeight: 24 },
  eyebrow: { fontFamily: F.bodySemi, fontSize: 13, lineHeight: 18, letterSpacing: 1.4, textTransform: "uppercase" },
  body: { fontFamily: F.body, fontSize: 17, lineHeight: 25 },
  bodyStrong: { fontFamily: F.bodySemi, fontSize: 17, lineHeight: 25 },
  small: { fontFamily: F.body, fontSize: 15, lineHeight: 21 },
  smallStrong: { fontFamily: F.bodySemi, fontSize: 15, lineHeight: 21 },
});

export const s = StyleSheet.create({
  pressed: { opacity: 0.7 },
  shadow: { shadowColor: "#2B1E1A", shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontFamily: F.body, fontSize: 17, borderWidth: 1 },
});

// ---- network + storage ----

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

export const addMin = (t: string, m: number) => {
  const [h, mm] = t.split(":").map(Number);
  const x = h * 60 + mm + m;
  return `${String(Math.floor(x / 60) % 24).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
};
