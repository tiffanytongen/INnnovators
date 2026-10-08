// Shared look, type and network helpers.
//
// A neutral, layered base (warm off-white, white cards, dark ink) for both roles; colour guides attention:
//   Attendee  — peach accent: the "leave at" hero tile and the main action.
//   Organizer — green accent: solved/apply tiles and actions.
//   Semantic  — red for "needs you"/warnings, map colours on the map.
// Type: Bricolage Grotesque for headings and big numbers, Figtree for reading text.
import { StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

// ---- fonts (loaded in App.tsx; family name = the key passed to useFonts) ----
export const F = {
  display: "BricolageGrotesque_600SemiBold",
  displayBold: "BricolageGrotesque_700Bold",
  body: "Figtree_400Regular",
  bodyMed: "Figtree_500Medium",
  bodySemi: "Figtree_600SemiBold",
  bodyBold: "Figtree_700Bold",
};

// ---- palettes ----
export type Pal = {
  name: "attendee" | "planb" | "organizer";
  bg: string; // screen: warm off-white
  band: string; // top bar / header area: neutral, never flooded with accent
  card: string;
  raised: string; // inputs, inner panels
  ink: string;
  sub: string; // secondary text (≥4.5:1 on bg and card)
  line: string;
  accent: string; // the one primary action colour
  onAccent: string;
  soft: string; // light accent tint for small highlights
  hero: string; // the one strong colour tile per screen (attendee: leave-at; organizer: solved)
  onHero: string;
  danger: string;
  dangerSoft: string;
  ok: string;
};

const NEUTRAL = { bg: "#F7F5F1", band: "#F7F5F1", card: "#FFFFFF", raised: "#F1EDE7", ink: "#1E1B18", sub: "#6A645E", line: "#E9E3DB", danger: "#B3372A", dangerSoft: "#FCE7E2", ok: "#2E7D52" };

export const ATTENDEE: Pal = { ...NEUTRAL, name: "attendee", accent: "#C2512F", onAccent: "#FFFFFF", soft: "#FFF1E9", hero: "#FFE1D2", onHero: "#3A1C12" };

// Plan B active: the hero tile deepens so the change is obvious without flooding the screen.
export const PLANB: Pal = { ...ATTENDEE, name: "planb", hero: "#FFC9AE" };

export const ORGANIZER: Pal = { ...NEUTRAL, name: "organizer", accent: "#2E7D52", onAccent: "#FFFFFF", soft: "#E9F4EC", hero: "#2E7D52", onHero: "#FFFFFF" };

// ---- type scale (no colours: components apply the palette) ----
export const T = StyleSheet.create({
  mega: { fontFamily: F.displayBold, fontSize: 68, lineHeight: 72, letterSpacing: -2 },
  huge: { fontFamily: F.displayBold, fontSize: 42, lineHeight: 46, letterSpacing: -1 },
  title: { fontFamily: F.displayBold, fontSize: 30, lineHeight: 35, letterSpacing: -0.6 },
  headline: { fontFamily: F.display, fontSize: 22, lineHeight: 28, letterSpacing: -0.2 },
  big: { fontFamily: F.bodySemi, fontSize: 18, lineHeight: 24 },
  eyebrow: { fontFamily: F.bodySemi, fontSize: 14, lineHeight: 19 }, // small sentence-case label, not tracked caps
  body: { fontFamily: F.body, fontSize: 17, lineHeight: 25 },
  bodyStrong: { fontFamily: F.bodySemi, fontSize: 17, lineHeight: 25 },
  small: { fontFamily: F.body, fontSize: 15, lineHeight: 21 },
  smallStrong: { fontFamily: F.bodySemi, fontSize: 15, lineHeight: 21 },
});

export const s = StyleSheet.create({
  pressed: { opacity: 0.7 },
  shadow: { shadowColor: "#3B2A1E", shadowOpacity: 0.07, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
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
