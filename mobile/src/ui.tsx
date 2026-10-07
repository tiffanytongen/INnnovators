// Small building blocks shared by every screen (adapted from the earlier pastel design).
// Everything reads the current palette, so the same component works for attendee and organizer.
import { createContext, useContext, type ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from "react-native";
import { ATTENDEE, F, T, s, type Pal } from "./theme";

export const PalContext = createContext<Pal>(ATTENDEE);
export const usePal = () => useContext(PalContext);

type TxtKind = keyof typeof T;
type Tone = "ink" | "sub" | "danger" | "ok" | "accent" | "onAccent";
export function Txt({ k = "body", c, style, children, numberOfLines }: { k?: TxtKind; c?: Tone; style?: StyleProp<TextStyle>; children: ReactNode; numberOfLines?: number }) {
  const p = usePal();
  return <Text numberOfLines={numberOfLines} style={[T[k], { color: p[c ?? "ink"] }, style]}>{children}</Text>;
}

export function Rule({ style }: { style?: StyleProp<ViewStyle> }) {
  const p = usePal();
  return <View style={[{ height: 1, alignSelf: "stretch", backgroundColor: p.line }, style]} />;
}

// White rounded card with a soft shadow. Use only to group genuinely related things.
export function Card({ children, style, tint }: { children: ReactNode; style?: StyleProp<ViewStyle>; tint?: boolean }) {
  const p = usePal();
  return <View style={[s.shadow, { backgroundColor: tint ? p.soft : p.card, borderRadius: 20, padding: 20, gap: 12 }, style]}>{children}</View>;
}

// "solid" = the one main action; "line" = secondary; "ghost" = quiet text link.
export function Btn({ title, onPress, kind = "solid", busy, disabled, style }: { title: string; onPress: () => void; kind?: "solid" | "line" | "ghost"; busy?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const p = usePal();
  const fg = kind === "solid" ? p.onAccent : kind === "line" ? p.accent : p.sub;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={busy || disabled}
      style={({ pressed }) => [
        kind === "ghost"
          ? { minHeight: 44, justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 8 }
          : { minHeight: 56, paddingHorizontal: 20, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: kind === "solid" ? p.accent : "transparent", borderWidth: kind === "line" ? 1.5 : 0, borderColor: p.accent },
        (pressed || busy || disabled) && s.pressed,
        style,
      ]}
    >
      {busy && <ActivityIndicator color={fg} />}
      <Text style={[kind === "ghost" ? T.smallStrong : T.big, { color: fg, textDecorationLine: kind === "ghost" ? "underline" : "none", textAlign: "center", flexShrink: 1 }]}>{title}</Text>
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
          <Pressable key={v} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onChange(v)} style={({ pressed }) => [{ minHeight: 44, paddingHorizontal: 16, justifyContent: "center", borderRadius: 999, borderWidth: 1, borderColor: on ? p.accent : p.line, backgroundColor: on ? p.accent : p.card }, pressed && s.pressed]}>
            <Text style={{ fontFamily: on ? F.bodySemi : F.body, fontSize: 15, color: on ? p.onAccent : p.ink }}>{l}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Toggle({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const p = usePal();
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: on }} onPress={onPress} style={({ pressed }) => [{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 14, borderBottomWidth: 1, borderBottomColor: p.line }, pressed && s.pressed]}>
      <Txt k="bodyStrong" style={{ flex: 1 }}>{label}</Txt>
      <View style={{ width: 50, height: 30, borderRadius: 15, padding: 3, backgroundColor: on ? p.accent : p.line, alignItems: on ? "flex-end" : "flex-start" }}>
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "#FFFFFF" }} />
      </View>
    </Pressable>
  );
}

export function Field(props: TextInputProps) {
  const p = usePal();
  return <TextInput placeholderTextColor={p.sub} {...props} style={[s.input, { color: p.ink, backgroundColor: p.card, borderColor: p.line }, props.style]} />;
}

export function Notice({ tone = "danger", children }: { tone?: "danger" | "ink"; children: ReactNode }) {
  const p = usePal();
  return (
    <View style={{ backgroundColor: tone === "danger" ? "#FDE8E4" : p.raised, borderRadius: 14, padding: 14 }}>
      <Txt k="bodyStrong" c={tone === "danger" ? "danger" : "ink"}>{children}</Txt>
    </View>
  );
}

// ✓ line for "Why this plan" lists.
export function Check({ children }: { children: ReactNode }) {
  const p = usePal();
  return (
    <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
      <Text style={{ fontFamily: F.bodyBold, fontSize: 17, lineHeight: 25, color: p.ok }}>✓</Text>
      <Txt style={{ flex: 1 }}>{children}</Txt>
    </View>
  );
}
