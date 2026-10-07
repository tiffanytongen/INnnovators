// Shared look, type and network helpers for both the Participant and Organizer sides.
//
// The look: a night fairground. Deep indigo sky with a few stars, cream "ticket" cards, gold marquee light,
// candy pink and teal for crowd states. When Plan B is triggered the participant's WHOLE screen flips to
// marquee gold — the screen itself is the alert.
// Type: Young Serif (storybook display) for headlines and times, Outfit for everything you read in sentences.
import { StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

// ---- fonts (loaded in App.tsx; family name = the key passed to useFonts). Swap the display face here. ----
export const F = {
  display: "YoungSerif_400Regular",
  body: "Outfit_400Regular",
  bodyMed: "Outfit_500Medium",
  bodySemi: "Outfit_600SemiBold",
  bodyBold: "Outfit_700Bold",
  bodyBlack: "Outfit_800ExtraBold",
};

// ---- palettes ----
export type Pal = {
  name: "night" | "alert";
  bg: string; // screen
  raised: string; // inputs, pressed rows, panels
  ink: string; // main text
  sub: string; // secondary text (≥4.5:1 on bg)
  line: string; // hairlines
  accent: string; // the one loud colour (buttons)
  onAccent: string; // text on accent
  accentEdge: string; // the chunky "pressed-in" edge under accent buttons
  danger: string;
  ok: string;
  ticket: string; // cream ticket card
  onTicket: string;
  ticketSub: string;
  ticketShadow: string; // offset block under the ticket
  star: string;
};

export const NIGHT: Pal = {
  name: "night",
  bg: "#17123B",
  raised: "#241C57",
  ink: "#FFF4DE",
  sub: "#C8C0EA",
  line: "rgba(255,244,222,0.16)",
  accent: "#FFC94A",
  onAccent: "#17123B",
  accentEdge: "#B8862A",
  danger: "#FF8DBE",
  ok: "#3FD0C9",
  ticket: "#FFF4DE",
  onTicket: "#17123B",
  ticketSub: "#5A5378",
  ticketShadow: "#FF5FA2",
  star: "rgba(255,244,222,0.3)",
};

// Plan B: the whole screen goes marquee gold.
export const ALERT: Pal = {
  name: "alert",
  bg: "#FFC94A",
  raised: "#F5B92E",
  ink: "#17123B",
  sub: "#4A3B12",
  line: "rgba(23,18,59,0.22)",
  accent: "#17123B",
  onAccent: "#FFC94A",
  accentEdge: "#000000",
  danger: "#9E1550",
  ok: "#0B5E5A",
  ticket: "#FFF4DE",
  onTicket: "#17123B",
  ticketSub: "#5A5378",
  ticketShadow: "#17123B",
  star: "transparent",
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
  mega: { fontFamily: F.display, fontSize: 96, lineHeight: 100 },
  huge: { fontFamily: F.display, fontSize: 52, lineHeight: 58 },
  title: { fontFamily: F.display, fontSize: 36, lineHeight: 42 },
  headline: { fontFamily: F.display, fontSize: 27, lineHeight: 34 },
  big: { fontFamily: F.bodyBold, fontSize: 19, lineHeight: 24 },
  label: { fontFamily: F.bodyBold, fontSize: 12, letterSpacing: 1.6, textTransform: "uppercase" },
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
  input: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontFamily: F.body, fontSize: 17, borderWidth: 1 },
  bar: { minHeight: 60, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
