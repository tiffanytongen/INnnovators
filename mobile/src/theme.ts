// Shared look, type and network helpers for both the Participant and Organizer sides.
//
// The look: a calm pastel-green app. A coloured header band with the greeting, white rounded cards that
// overlap it, one big number on the main card, and a tab bar with a raised centre button.
// When Plan B is triggered the band and accents flip from pastel green to pastel coral, so the change is
// obvious at a glance without shouting.
// Type: Jost (geometric sans) throughout.
import { StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

// ---- fonts (loaded in App.tsx; family name = the key passed to useFonts). ----
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
  name: "calm" | "alert";
  bg: string; // screen under the cards
  band: string; // header band
  bandDeep: string; // a slightly deeper band tone (decorative curve)
  card: string;
  raised: string; // inputs, pressed rows, inner panels
  ink: string;
  sub: string; // secondary text (≥4.5:1 on card and band)
  line: string;
  accent: string; // buttons, links, selected states
  onAccent: string;
  badgeBg: string;
  badgeInk: string;
  danger: string;
  ok: string;
  track: string; // empty progress segments
};

export const CALM: Pal = {
  name: "calm",
  bg: "#F4F8F3",
  band: "#CFEBD5",
  bandDeep: "#BFE3C7",
  card: "#FFFFFF",
  raised: "#EEF5EE",
  ink: "#1E2B23",
  sub: "#56655B",
  line: "#E1EAE2",
  accent: "#2F7A4E",
  onAccent: "#FFFFFF",
  badgeBg: "#DDF1E1",
  badgeInk: "#1F5C39",
  danger: "#B33A2B",
  ok: "#2F7A4E",
  track: "#DCE6DE",
};

// Plan B: the band and accents turn pastel coral.
export const ALERT: Pal = {
  name: "alert",
  bg: "#FBF4F1",
  band: "#FFD6C9",
  bandDeep: "#FCC7B6",
  card: "#FFFFFF",
  raised: "#FBEEE9",
  ink: "#2B1E1A",
  sub: "#6B5650",
  line: "#F0E2DC",
  accent: "#B4472F",
  onAccent: "#FFFFFF",
  badgeBg: "#FFE3DA",
  badgeInk: "#8A2F1C",
  danger: "#B33A2B",
  ok: "#2F7A4E",
  track: "#F0DED7",
};

// Older names, kept so nothing else breaks.
export const NIGHT = CALM;
export const C = {
  bg: CALM.bg,
  card: CALM.card,
  line: CALM.line,
  text: CALM.ink,
  muted: CALM.sub,
  green: CALM.ok,
  greenBg: CALM.badgeBg,
  alert: CALM.accent,
  red: CALM.danger,
};

// ---- type scale (no colours: screens pass the palette's) ----
export const T = StyleSheet.create({
  mega: { fontFamily: F.display, fontSize: 76, lineHeight: 84, letterSpacing: -1.5 },
  huge: { fontFamily: F.display, fontSize: 44, lineHeight: 50, letterSpacing: -0.5 },
  title: { fontFamily: F.display, fontSize: 32, lineHeight: 38 },
  headline: { fontFamily: F.display, fontSize: 24, lineHeight: 30 },
  big: { fontFamily: F.bodySemi, fontSize: 18, lineHeight: 24 },
  label: { fontFamily: F.bodySemi, fontSize: 13, lineHeight: 18 },
  body: { fontFamily: F.body, fontSize: 17, lineHeight: 25 },
  bodyStrong: { fontFamily: F.bodySemi, fontSize: 17, lineHeight: 25 },
  small: { fontFamily: F.body, fontSize: 15, lineHeight: 21 },
  smallStrong: { fontFamily: F.bodySemi, fontSize: 15, lineHeight: 21 },
});

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

// ---- small shared styles that don't depend on palette ----
export const s = StyleSheet.create({
  pressed: { opacity: 0.7 },
  gutter: { paddingHorizontal: 20 },
  shadow: { shadowColor: "#1E2B23", shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  rule: { height: StyleSheet.hairlineWidth * 2, alignSelf: "stretch" },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12 },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontFamily: F.body, fontSize: 17, borderWidth: 1 },
  bar: { minHeight: 60, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
