// Small building blocks shared by every screen. Everything reads the current palette, so the same
// component works on the calm (green) screens and on the Plan B (coral) screens.
import { createContext, useContext, type ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from "react-native";
import Svg, { Path, Circle, Rect } from "react-native-svg";
import { CALM, F, T, s, type Pal } from "./theme";

export const PalContext = createContext<Pal>(CALM);
export const usePal = () => useContext(PalContext);

type TxtKind = keyof typeof T;
type Tone = "ink" | "sub" | "danger" | "ok" | "accent" | "onAccent" | "badgeInk";
export function Txt({ k = "body", c, style, children, numberOfLines }: { k?: TxtKind; c?: Tone; style?: StyleProp<TextStyle>; children: ReactNode; numberOfLines?: number }) {
  const p = usePal();
  return <Text numberOfLines={numberOfLines} style={[T[k], { color: p[c ?? "ink"] }, style]}>{children}</Text>;
}

export function Rule({ style }: { style?: StyleProp<ViewStyle> }) {
  const p = usePal();
  return <View style={[s.rule, { backgroundColor: p.line }, style]} />;
}

// White rounded card with a soft shadow.
export function Card({ children, style, onPress, label }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; label?: string }) {
  const p = usePal();
  const base: StyleProp<ViewStyle> = [s.shadow, { backgroundColor: p.card, borderRadius: 18, padding: 20, gap: 12 }, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [base, pressed && s.pressed]}>
      {children}
    </Pressable>
  );
}

// Section heading above a group of cards.
export function Label({ children, right, style }: { children: ReactNode; right?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }, style]}>
      <Txt k="headline">{children}</Txt>
      {right}
    </View>
  );
}

// Small rounded tag, e.g. "Plan A · Tonight".
export function Badge({ children }: { children: ReactNode }) {
  const p = usePal();
  return (
    <View style={{ backgroundColor: p.badgeBg, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 4, alignSelf: "flex-start" }}>
      <Txt k="label" c="badgeInk">{children}</Txt>
    </View>
  );
}

// "solid" = main action; "line" = outlined; "ghost" = underlined link.
export function Btn({ title, onPress, kind = "solid", busy, disabled, style, right }: { title: string; onPress: () => void; kind?: "solid" | "line" | "ghost"; busy?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>; right?: string }) {
  const p = usePal();
  const fg = kind === "solid" ? p.onAccent : kind === "line" ? p.accent : p.ink;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={busy || disabled}
      style={({ pressed }) => [
        kind === "ghost"
          ? { minHeight: 44, justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 8 }
          : { minHeight: 54, paddingHorizontal: 20, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: kind === "solid" ? p.accent : p.card, borderWidth: kind === "line" ? 1.5 : 0, borderColor: p.accent },
        (pressed || busy || disabled) && s.pressed,
        style,
      ]}
    >
      {busy && <ActivityIndicator color={fg} />}
      <Text style={[kind === "ghost" ? T.smallStrong : T.big, { color: fg, textDecorationLine: kind === "ghost" ? "underline" : "none", flexShrink: 1, textAlign: "center" }]}>{title}</Text>
      {kind !== "ghost" && right ? <Text style={[T.big, { color: fg }]}>{right}</Text> : null}
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
      <View style={{ width: 50, height: 30, borderRadius: 15, padding: 3, backgroundColor: on ? p.accent : p.track, alignItems: on ? "flex-end" : "flex-start" }}>
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

// Segmented progress: `total` bars, the first `done` filled.
export function Segments({ total, done }: { total: number; done: number }) {
  const p = usePal();
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: i < done ? p.accent : p.track }} />
      ))}
    </View>
  );
}

// A row of dots grouped under labels (a journey: Walk → Gate → Ride). The first dot of the active group is filled.
export function Journey({ groups }: { groups: { label: string; dots: number; active?: boolean }[] }) {
  const p = usePal();
  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      {groups.map((g) => (
        <View key={g.label} style={{ flex: g.dots, gap: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            {Array.from({ length: g.dots }).map((_, i) => (
              <View key={i} style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: g.active ? p.accent : p.track, backgroundColor: g.active && i === 0 ? p.accent : p.card }} />
            ))}
          </View>
          <View style={{ height: 6, borderLeftWidth: 1.5, borderRightWidth: 1.5, borderBottomWidth: 1.5, borderColor: p.track, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 }} />
          <Txt k="small" c={g.active ? "ink" : "sub"} style={{ textAlign: "center" }}>{g.label}</Txt>
        </View>
      ))}
    </View>
  );
}

// Simple stroke icons for the tab bar (no emoji).
type IconName = "home" | "map" | "phone" | "user" | "help";
export function Icon({ name, color, size = 24 }: { name: IconName; color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {name === "home" && <Path d="M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5M10 20v-5h4v5" />}
      {name === "map" && <Path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2ZM9 4v14M15 6v14" />}
      {name === "phone" && <><Rect x={7} y={3} width={10} height={18} rx={2} /><Path d="M11 18h2" /></>}
      {name === "user" && <><Circle cx={12} cy={8} r={4} /><Path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>}
      {name === "help" && <><Circle cx={12} cy={12} r={9} /><Path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14M12 17h.01" /></>}
    </Svg>
  );
}

// Bottom tab bar with a raised round centre button.
export function TabBar({ items, center }: { items: { icon: IconName; label: string; onPress: () => void; active?: boolean }[]; center: { label: string; onPress: () => void } }) {
  const p = usePal();
  const half = Math.ceil(items.length / 2);
  const tab = (it: (typeof items)[number]) => (
    <Pressable key={it.label} accessibilityRole="tab" accessibilityState={{ selected: !!it.active }} onPress={it.onPress} style={({ pressed }) => [{ flex: 1, minHeight: 60, alignItems: "center", justifyContent: "center", gap: 3 }, pressed && s.pressed]}>
      <Icon name={it.icon} color={it.active ? p.accent : p.sub} />
      <Text style={{ fontFamily: it.active ? F.bodySemi : F.body, fontSize: 12, color: it.active ? p.accent : p.sub }}>{it.label}</Text>
    </Pressable>
  );
  return (
    <View style={[s.shadow, { flexDirection: "row", alignItems: "flex-end", backgroundColor: p.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 6, paddingBottom: 4 }]}>
      {items.slice(0, half).map(tab)}
      <View style={{ flex: 1, alignItems: "center" }}>
        <Pressable accessibilityRole="button" accessibilityLabel={center.label} onPress={center.onPress} style={({ pressed }) => [s.shadow, { width: 64, height: 64, borderRadius: 32, marginTop: -26, marginBottom: 2, backgroundColor: p.accent, alignItems: "center", justifyContent: "center", borderWidth: 4, borderColor: p.card }, pressed && s.pressed]}>
          <Text style={{ fontFamily: F.displayBold, fontSize: 20, color: p.onAccent }}>B</Text>
        </Pressable>
        <Text style={{ fontFamily: F.bodySemi, fontSize: 12, color: p.accent, marginBottom: 6 }}>{center.label}</Text>
      </View>
      {items.slice(half).map(tab)}
    </View>
  );
}

// The coloured header band behind the top of a screen; cards placed inside it overlap its lower edge.
export function Band({ children, height = 250 }: { children: ReactNode; height?: number }) {
  const p = usePal();
  return (
    <View>
      <View style={{ position: "absolute", left: 0, right: 0, top: 0, height, backgroundColor: p.band, overflow: "hidden" }}>
        <View style={{ position: "absolute", right: -80, top: -60, width: 260, height: 260, borderRadius: 130, backgroundColor: p.bandDeep }} />
      </View>
      {children}
    </View>
  );
}
