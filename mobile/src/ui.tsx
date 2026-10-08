// Small building blocks shared by every screen (adapted from the earlier pastel design).
// Everything reads the current palette, so the same component works for attendee and organizer.
import { createContext, useContext, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from "react-native";
import { ATTENDEE, C, F, T, s, type Pal } from "./theme";

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
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const p = usePal();
  return <View style={[s.shadow, { backgroundColor: p.card, borderRadius: 28, padding: 20, gap: 12 }, style]}>{children}</View>;
}

// Small white circle with a glyph, for the top corner of colour tiles.
export function Dot({ glyph, color, size = 40 }: { glyph: string; color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.white, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: F.bodyBold, fontSize: size * 0.45, lineHeight: size * 0.6, color }}>{glyph}</Text>
    </View>
  );
}

// Solid flat colour tile (ride-app style): icon circle on top, bold label at the bottom.
// Text is white, except on yellow where it's ink for legibility.
export function Tile({ color, glyph, children, style }: { color: string; glyph?: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ backgroundColor: color, borderRadius: 28, padding: 18, gap: 10, justifyContent: "space-between" }, style]}>
      {glyph ? <Dot glyph={glyph} color={color === C.yellow ? C.ink : color} /> : null}
      <View style={{ gap: 2 }}>{children}</View>
    </View>
  );
}
export const onTile = (color: string) => (color === C.yellow ? C.ink : C.white);

// White pill inside a colour tile (like the "Taxi" pill on the ride card).
export function InnerPill({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <View style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.white, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 }}>
      <Text style={[T.smallStrong, { color: color ?? C.ink }]}>{children}</Text>
    </View>
  );
}

// "solid" = the one main action; "line" = secondary; "ghost" = quiet text link.
export function Btn({ title, onPress, kind = "solid", busy, disabled, style }: { title: string; onPress: () => void; kind?: "solid" | "line" | "ghost"; busy?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const p = usePal();
  const fg = kind === "solid" ? p.onAccent : kind === "line" ? p.ink : p.sub;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={busy || disabled}
      style={({ pressed }) => [
        kind === "ghost"
          ? { minHeight: 44, justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 8 }
          : { minHeight: 56, paddingHorizontal: 24, borderRadius: 999, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: kind === "solid" ? p.accent : p.card, borderWidth: kind === "line" ? 1 : 0, borderColor: p.line },
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
    <View style={{ backgroundColor: tone === "danger" ? p.dangerSoft : p.raised, borderRadius: 22, padding: 16 }}>
      <Txt k="bodyStrong" style={{ color: tone === "danger" ? C.white : p.ink }}>{children}</Txt>
    </View>
  );
}

// ✓ line for "Why this plan" lists: small green circle with a white tick.
export function Check({ children }: { children: ReactNode }) {
  const p = usePal();
  return (
    <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, marginTop: 2, backgroundColor: p.ok, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontFamily: F.bodyBold, fontSize: 12, color: C.white }}>✓</Text>
      </View>
      <Txt style={{ flex: 1 }}>{children}</Txt>
    </View>
  );
}

// Dropdown: a field showing the current choice; tap to open the list underneath.
export function Select({ options, value, onChange, placeholder = "Choose…" }: { options: [string, string][]; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const p = usePal();
  const [open, setOpen] = useState(false);
  const current = options.find(([v]) => v === value)?.[1];
  return (
    <View style={{ gap: 6 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={({ pressed }) => [s.between, { minHeight: 54, paddingHorizontal: 18, borderRadius: 18, borderWidth: 1, borderColor: open ? p.accent : p.line, backgroundColor: p.card }, pressed && s.pressed]}>
        <Txt c={current ? "ink" : "sub"}>{current ?? placeholder}</Txt>
        <Txt k="bodyStrong" c="sub">{open ? "⌃" : "⌄"}</Txt>
      </Pressable>
      {open && (
        <View style={[s.shadow, { backgroundColor: p.card, borderRadius: 18, paddingVertical: 6 }]}>
          {options.map(([v, l]) => {
            const on = v === value;
            return (
              <Pressable key={v} accessibilityRole="menuitem" accessibilityState={{ selected: on }} onPress={() => { onChange(v); setOpen(false); }} style={({ pressed }) => [s.between, { minHeight: 46, paddingHorizontal: 18 }, pressed && { backgroundColor: p.raised }]}>
                <Txt k={on ? "bodyStrong" : "body"} c={on ? "accent" : "ink"}>{l}</Txt>
                {on ? <Txt k="bodyStrong" c="accent">✓</Txt> : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
