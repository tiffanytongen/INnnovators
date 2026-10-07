// Tiny building blocks shared by every screen. Everything takes the current palette so the
// same component works on the night screen and on the yellow Plan B screen.
import { createContext, useContext, type ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from "react-native";
import { F, NIGHT, T, s, type Pal } from "./theme";
import { StyleSheet } from "react-native";

export const PalContext = createContext<Pal>(NIGHT);
export const usePal = () => useContext(PalContext);

type TxtKind = keyof typeof T;
export function Txt({ k = "body", c, style, children, numberOfLines }: { k?: TxtKind; c?: "ink" | "sub" | "danger" | "ok" | "accent" | "onAccent" | "onTicket" | "ticketSub"; style?: StyleProp<TextStyle>; children: ReactNode; numberOfLines?: number }) {
  const p = usePal();
  return <Text numberOfLines={numberOfLines} style={[T[k], { color: p[c ?? "ink"] }, style]}>{children}</Text>;
}

export function Rule({ style, strong }: { style?: StyleProp<ViewStyle>; strong?: boolean }) {
  const p = usePal();
  return <View style={[s.rule, { backgroundColor: strong ? p.ink : p.line }, style]} />;
}

// Section heading: small spaced caps.
export function Label({ children, right, style }: { children: ReactNode; right?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }, style]}>
      <Txt k="label" c="sub">{children}</Txt>
      {right}
    </View>
  );
}

// Full-width action. "solid" = the loud one; "line" = outlined; "ghost" = text only.
export function Btn({ title, onPress, kind = "solid", busy, disabled, style, right }: { title: string; onPress: () => void; kind?: "solid" | "line" | "ghost"; busy?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>; right?: string }) {
  const p = usePal();
  const bg = kind === "solid" ? p.accent : "transparent";
  const fg = kind === "solid" ? p.onAccent : p.ink;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={busy || disabled}
      style={({ pressed }) => [
        { minHeight: 56, paddingHorizontal: 20, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: kind === "ghost" || right === "" ? "center" : "space-between", gap: 10, backgroundColor: bg, borderWidth: kind === "line" ? 2 : 0, borderColor: kind === "line" ? p.line : "transparent" },
        kind === "solid" && { borderBottomWidth: 5, borderBottomColor: p.accentEdge },
        (pressed || busy || disabled) && s.pressed,
        style,
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 }}>
        {busy && <ActivityIndicator color={fg} />}
        <Text style={[kind === "ghost" ? T.smallStrong : T.big, { color: fg, textDecorationLine: kind === "ghost" ? "underline" : "none", flexShrink: 1 }]}>{title}</Text>
      </View>
      {kind !== "ghost" && right !== "" && <Text style={[T.big, { color: fg }]}>{right ?? "→"}</Text>}
    </Pressable>
  );
}

export function Chips({ options, value, onChange }: { options: [string, string][]; value: string; onChange: (v: string) => void }) {
  const p = usePal();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map(([v, l]) => {
        const on = value === v;
        return (
          <Pressable key={v} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onChange(v)} style={({ pressed }) => [{ minHeight: 44, paddingHorizontal: 14, justifyContent: "center", borderRadius: 999, borderWidth: 1.5, borderColor: on ? p.accent : p.line, backgroundColor: on ? p.accent : "transparent" }, pressed && s.pressed]}>
            <Text style={{ fontFamily: on ? F.bodyBold : F.bodyMed, fontSize: 15, color: on ? p.onAccent : p.ink }}>{l}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Toggle({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const p = usePal();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={onPress} style={({ pressed }) => [{ minHeight: 52, flexDirection: "row", alignItems: "center", gap: 14, borderBottomWidth: 1, borderBottomColor: p.line }, pressed && s.pressed]}>
      <Txt k="bodyStrong" style={{ flex: 1 }}>{label}</Txt>
      <View style={{ width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: on ? p.accent : p.sub, backgroundColor: on ? p.accent : "transparent", alignItems: "center", justifyContent: "center" }}>
        {on && <Text style={{ color: p.onAccent, fontFamily: F.bodyBold, fontSize: 16 }}>✓</Text>}
      </View>
    </Pressable>
  );
}

export function Field(props: TextInputProps) {
  const p = usePal();
  return <TextInput placeholderTextColor={p.sub} {...props} style={[s.input, { color: p.ink, backgroundColor: p.raised, borderColor: p.line }, props.style]} />;
}

// A boxed notice for errors and warnings.
export function Notice({ tone = "danger", children }: { tone?: "danger" | "ink"; children: ReactNode }) {
  const p = usePal();
  const c = tone === "danger" ? p.danger : p.ink;
  return (
    <View style={{ borderWidth: 2, borderColor: c, borderRadius: 16, padding: 14 }}>
      <Txt k="bodyStrong" c={tone === "danger" ? "danger" : "ink"}>{children}</Txt>
    </View>
  );
}

// A few fixed stars behind the screen (night only). Positions are % so they work at any size.
const STARS: [number, number, number][] = [
  [6, 4, 2], [22, 11, 1.5], [41, 3, 2.5], [63, 8, 1.5], [84, 5, 2], [93, 16, 1.5], [12, 24, 1.5], [74, 22, 2],
  [33, 31, 1.5], [55, 38, 2], [88, 41, 1.5], [8, 47, 2], [27, 56, 1.5], [68, 59, 2], [46, 66, 1.5], [91, 70, 2],
  [15, 78, 1.5], [58, 83, 2], [36, 90, 1.5], [80, 93, 2],
];
export function Stars() {
  const p = usePal();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {STARS.map(([x, y, r], i) => (
        <View key={i} style={{ position: "absolute", left: `${x}%`, top: `${y}%`, width: r * 2, height: r * 2, borderRadius: r, backgroundColor: p.star }} />
      ))}
    </View>
  );
}

// The cream ticket: notches on both sides at the tear line, an offset colour block underneath.
export function Ticket({ top, bottom, footer }: { top: ReactNode; bottom: ReactNode; footer?: ReactNode }) {
  const p = usePal();
  const notch = { position: "absolute" as const, width: 26, height: 26, borderRadius: 13, backgroundColor: p.bg };
  return (
    <View style={{ paddingBottom: 10 }}>
      <View style={{ position: "absolute", left: 0, right: 0, top: 10, bottom: 0, borderRadius: 22, backgroundColor: p.ticketShadow }} />
      <View style={{ backgroundColor: p.ticket, borderRadius: 22, overflow: "hidden" }}>
        <View style={{ padding: 20, paddingBottom: 6, gap: 10 }}>{top}</View>
        <View style={{ height: 26, justifyContent: "center" }}>
          <View style={[notch, { left: -13 }]} />
          <View style={[notch, { right: -13 }]} />
          <View style={{ marginHorizontal: 22, borderTopWidth: 2, borderStyle: "dashed", borderColor: "rgba(23,18,59,0.25)" }} />
        </View>
        <View style={{ padding: 20, paddingTop: 6, gap: 16 }}>{bottom}{footer}</View>
      </View>
    </View>
  );
}
