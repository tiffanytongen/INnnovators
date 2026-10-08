// Shared look, type and network helpers.
//
// Flat colour, ride-app style: a light grey screen, white sheets and cards, and a few solid, distinct
// colour tiles with white text (never tints or shades of one hue):
//   green  — Plan A / solved     pink   — Plan B / needs you
//   yellow — waves / gates        purple — the main action and selected pills
// Type: Figtree throughout (ExtraBold for headings and big numbers).
import { StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

// ---- fonts (loaded in App.tsx; family name = the key passed to useFonts) ----
export const F = {
  display: "Figtree_800ExtraBold",
  displayBold: "Figtree_800ExtraBold",
  body: "Figtree_400Regular",
  bodyMed: "Figtree_500Medium",
  bodySemi: "Figtree_600SemiBold",
  bodyBold: "Figtree_700Bold",
};

// ---- the flat colour set ----
export const C = {
  green: "#3DAA6E",
  pink: "#EF7A92",
  yellow: "#F6C744",
  purple: "#6C5CE7",
  white: "#FFFFFF",
  ink: "#16161D",
};

// ---- palettes ----
export type Pal = {
  name: "attendee" | "planb" | "organizer";
  bg: string; // screen: light grey
  band: string; // top bar: same grey
  card: string; // white sheets and cards
  raised: string; // inputs, inner panels: grey
  ink: string;
  sub: string;
  line: string;
  accent: string; // main action + selected pills (purple)
  onAccent: string;
  soft: string; // quiet panel (grey, never a tint)
  hero: string; // the solid colour "your ride" tile
  onHero: string;
  danger: string;
  dangerSoft: string; // solid pink for warnings
  ok: string;
};

const BASE = { bg: "#F1F1F4", band: "#F1F1F4", card: C.white, raised: "#F1F1F4", ink: C.ink, sub: "#6B6B78", line: "#E4E4EA", accent: C.purple, onAccent: C.white, soft: "#F1F1F4", onHero: C.white, danger: "#D93A55", dangerSoft: C.pink, ok: C.green };

export const ATTENDEE: Pal = { ...BASE, name: "attendee", hero: C.green };
// Plan B active: the hero tile switches to a different colour, not a deeper shade.
export const PLANB: Pal = { ...BASE, name: "planb", hero: C.pink };
export const ORGANIZER: Pal = { ...BASE, name: "organizer", hero: C.green };

// ---- type scale (no colours: components apply the palette) ----
export const T = StyleSheet.create({
  mega: { fontFamily: F.displayBold, fontSize: 64, lineHeight: 70, letterSpacing: -2 },
  huge: { fontFamily: F.displayBold, fontSize: 42, lineHeight: 46, letterSpacing: -1 },
  title: { fontFamily: F.displayBold, fontSize: 30, lineHeight: 35, letterSpacing: -0.6 },
  headline: { fontFamily: F.bodyBold, fontSize: 22, lineHeight: 28, letterSpacing: -0.2 },
  big: { fontFamily: F.bodySemi, fontSize: 18, lineHeight: 24 },
  eyebrow: { fontFamily: F.bodySemi, fontSize: 14, lineHeight: 19 }, // small sentence-case label, not tracked caps
  body: { fontFamily: F.body, fontSize: 17, lineHeight: 25 },
  bodyStrong: { fontFamily: F.bodySemi, fontSize: 17, lineHeight: 25 },
  small: { fontFamily: F.body, fontSize: 15, lineHeight: 21 },
  smallStrong: { fontFamily: F.bodySemi, fontSize: 15, lineHeight: 21 },
});

export const s = StyleSheet.create({
  pressed: { opacity: 0.7 },
  shadow: { shadowColor: "#1B1B33", shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  input: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12, fontFamily: F.body, fontSize: 17, borderWidth: 1 },
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
