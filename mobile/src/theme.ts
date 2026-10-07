// Shared look, type and network helpers for both the Participant and Organizer sides.
//
// The look: festival signage at night. The app is dark by default (it's night, phones are dim, batteries matter).
// When Plan B is triggered the participant's WHOLE screen flips to safety yellow — the screen itself is the alert.
// Type: Big Shoulders (condensed signage caps) for anything you read from arm's length, Familjen Grotesk for sentences.
import { StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

// ---- fonts (loaded in App.tsx; family name = the key passed to useFonts) ----
export const F = {
  display: "BigShoulders_900Black",
  displayBold: "BigShoulders_800ExtraBold",
  displaySemi: "BigShoulders_700Bold",
  body: "FamiljenGrotesk_400Regular",
  bodyMed: "FamiljenGrotesk_500Medium",
  bodySemi: "FamiljenGrotesk_600SemiBold",
  bodyBold: "FamiljenGrotesk_700Bold",
};

// ---- palettes ----
export type Pal = {
  name: "night" | "alert";
  bg: string; // screen
  raised: string; // inputs, pressed rows
  ink: string; // main text
  sub: string; // secondary text (≥4.5:1 on bg)
  line: string; // hairlines
  accent: string; // the one loud colour
  onAccent: string; // text on accent
  danger: string;
  ok: string;
};

export const NIGHT: Pal = {
  name: "night",
  bg: "#0E0E0C",
  raised: "#1B1A17",
  ink: "#F2EFE6",
  sub: "#A8A397",
  line: "#2E2C27",
  accent: "#FFD400",
  onAccent: "#0E0E0C",
  danger: "#FF6A47",
  ok: "#86E3A8",
};

export const ALERT: Pal = {
  name: "alert",
  bg: "#FFD400",
  raised: "#F0C700",
  ink: "#0E0E0C",
  sub: "#4D4500",
  line: "rgba(14,14,12,0.22)",
  accent: "#0E0E0C",
  onAccent: "#FFD400",
  danger: "#A3200F",
  ok: "#0B5C2C",
};

// Kept for older call sites: maps onto the night palette.
export const C = {
  bg: NIGHT.bg,
  card: NIGHT.raised,
  line: NIGHT.line,
  text: NIGHT.ink,
  muted: NIGHT.sub,
  green: NIGHT.ok,
  greenBg: NIGHT.raised,
  alert: NIGHT.accent,
  red: NIGHT.danger,
};

// ---- type scale (no colours: screens pass the palette's) ----
export const T = StyleSheet.create({
  mega: { fontFamily: F.display, fontSize: 168, lineHeight: 150, letterSpacing: -4 },
  huge: { fontFamily: F.display, fontSize: 64, lineHeight: 60, letterSpacing: -1 },
  title: { fontFamily: F.display, fontSize: 44, lineHeight: 42, textTransform: "uppercase" },
  headline: { fontFamily: F.displayBold, fontSize: 34, lineHeight: 34, textTransform: "uppercase" },
  big: { fontFamily: F.displayBold, fontSize: 26, lineHeight: 27, textTransform: "uppercase" },
  label: { fontFamily: F.displaySemi, fontSize: 14, letterSpacing: 1.6, textTransform: "uppercase" },
  body: { fontFamily: F.body, fontSize: 17, lineHeight: 24 },
  bodyStrong: { fontFamily: F.bodySemi, fontSize: 17, lineHeight: 24 },
  small: { fontFamily: F.body, fontSize: 14, lineHeight: 20 },
  smallStrong: { fontFamily: F.bodySemi, fontSize: 14, lineHeight: 20 },
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
  rule: { height: StyleSheet.hairlineWidth * 2, alignSelf: "stretch" },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12 },
  input: { borderRadius: 4, paddingHorizontal: 14, paddingVertical: 12, fontFamily: F.body, fontSize: 17, borderWidth: 1.5 },
  bar: { minHeight: 60, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
