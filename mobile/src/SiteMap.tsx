// Phone version of the site map (react-native-svg). Same data and look as app/components/SiteMap.tsx on the web.
// Drawn from the map saved in the plan bundle, so it works in airplane mode.
import Svg, { Circle, G, Path, Polygon, Polyline, Rect, Text as SvgText } from "react-native-svg";
import { F, type Pal } from "./theme";
import { usePal } from "./ui";

type Pt = [number, number];
export type MapData = {
  viewBox: [number, number, number, number];
  site: Pt[];
  river: { label: string; y: number };
  outside: { id: string; x: number; y: number; label: string }[];
  gates: { id: string; x: number; y: number }[];
  places: { id: string; x: number; y: number; label: string; kind: string }[];
  routes: Record<string, Pt[]>;
  connections: Record<string, Pt[]>;
  covered: Record<string, boolean>;
};
type Props = {
  map: MapData;
  closedGates?: string[];
  closedPlaces?: string[];
  storm?: boolean;
  highlight?: { route_id: string; gate_id: string; dest_id?: string; meetup_id?: string | null } | null;
  gateDelta?: Record<string, number>; // organizer view: people gained per gate
};

const PAD = 48;

// Map colours follow the screen: a dark map at night, a paper map on the yellow Plan B screen.
function mapColours(p: Pal) {
  const dark = p.name === "night";
  return {
    bg: p.bg,
    river: dark ? "#14222B" : "#F6E9A6",
    riverText: dark ? "#7FA3B8" : "#4D4500",
    site: dark ? "#181A15" : "#FFE466",
    siteStroke: dark ? "#33362D" : "#0E0E0C",
    path: dark ? "#4A4A42" : "#7A6B00",
    pathCovered: dark ? "#6B6A60" : "#3D3500",
    pill: dark ? "#0E0E0C" : "#FFD400",
    pillStage: dark ? "#22221E" : "#0E0E0C",
    pillStroke: dark ? "#3A3933" : "#0E0E0C",
    text: dark ? "#E9E5DA" : "#0E0E0C",
    textStage: dark ? "#F2EFE6" : "#FFD400",
    ink: dark ? "#F2EFE6" : "#0E0E0C",
    onInk: dark ? "#0E0E0C" : "#FFD400",
    route: dark ? "#FFD400" : "#0E0E0C",
    gateActive: dark ? "#FFD400" : "#0E0E0C",
    onGateActive: dark ? "#0E0E0C" : "#FFD400",
    red: dark ? "#FF6A47" : "#A3200F",
    redBg: dark ? "#2A1510" : "#FFD9C7",
    you: dark ? "#6FB6FF" : "#0B3FB3",
  };
}
const pts = (p: Pt[]) => p.map((q) => q.join(",")).join(" ");

export default function SiteMap({ map, closedGates = [], closedPlaces = [], storm, highlight, gateDelta }: Props) {
  const K = mapColours(usePal());
  const INK = K.ink;
  const RED = K.red;
  const [, , W0, H] = map.viewBox;
  const W = W0 + PAD;
  const pos = (id: string) => map.gates.find((g) => g.id === id) ?? map.places.find((p) => p.id === id) ?? map.outside.find((o) => o.id === id);
  const conn = highlight?.dest_id ? map.connections[`${highlight.gate_id}>${highlight.dest_id}`] : undefined;
  const meet = highlight?.meetup_id ? pos(highlight.meetup_id) : undefined;
  const route = highlight ? map.routes[highlight.route_id] : undefined;

  return (
    <Svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ aspectRatio: W / H }}>
      <Rect x={0} y={0} width={W} height={H} fill={K.bg} />
      <Path d={`M0 ${map.river.y - 10} Q ${W / 2} ${map.river.y - 2} ${W} ${map.river.y - 12} L ${W} ${H} L 0 ${H} Z`} fill={K.river} />
      <SvgText x={W - 12} y={map.river.y + 16} textAnchor="end" fontSize={9} fill={K.riverText} fontFamily={F.displaySemi} letterSpacing={1}>{map.river.label}</SvgText>
      <G transform={`translate(${PAD},0)`}>
        <Polygon points={pts(map.site)} fill={K.site} stroke={K.siteStroke} strokeWidth={1.5} />

        {Object.entries(map.routes).map(([id, p]) => (
          <Polyline key={id} points={pts(p)} fill="none" stroke={map.covered[id] ? K.pathCovered : K.path} strokeWidth={map.covered[id] ? 2.5 : 1.5} strokeDasharray={map.covered[id] ? undefined : "4 3"} opacity={highlight ? 0.35 : storm && !map.covered[id] ? 0.25 : 0.9} />
        ))}
        {Object.entries(map.connections).map(([id, p]) => (
          <Polyline key={id} points={pts(p)} fill="none" stroke={K.path} strokeWidth={1} strokeDasharray="2 3" opacity={storm && !map.covered[id] ? 0.15 : 0.35} />
        ))}

        {route && <Polyline points={pts(route)} fill="none" stroke={K.route} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />}
        {conn && <Polyline points={pts(conn)} fill="none" stroke={K.route} strokeWidth={3} strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" />}

        {map.places.map((p) => {
          if (p.kind === "info") return <Circle key={p.id} cx={p.x} cy={p.y} r={4} fill={K.bg} stroke={K.path} />;
          const big = p.kind === "stage";
          const w = p.label.length * (big ? 5.4 : 4.6) + 10;
          return (
            <G key={p.id}>
              <Rect x={p.x - w / 2} y={p.y - 8} width={w} height={16} rx={3} fill={big ? K.pillStage : K.pill} stroke={K.pillStroke} />
              <SvgText x={p.x} y={p.y + 3.5} textAnchor="middle" fontSize={big ? 9 : 8} fontFamily={big ? F.bodyBold : F.bodyMed} fill={big ? K.textStage : K.text}>{p.label}</SvgText>
            </G>
          );
        })}

        {map.outside.map((o) => {
          const closed = closedPlaces.includes(o.id);
          const isDest = highlight?.dest_id === o.id;
          const w = o.label.length * 4.6 + 10;
          return (
            <G key={o.id}>
              <Rect x={o.x - w / 2} y={o.y - 8} width={w} height={16} rx={4} fill={isDest ? K.route : closed ? K.redBg : K.pill} stroke={closed ? RED : isDest ? K.route : K.pillStroke} />
              <SvgText x={o.x} y={o.y + 3} textAnchor="middle" fontSize={8} fontFamily={F.bodySemi} fill={isDest ? K.onGateActive : closed ? RED : K.text}>{closed ? `✕ ${o.label}` : o.label}</SvgText>
            </G>
          );
        })}

        {map.gates.map((g) => {
          const closed = closedGates.includes(g.id);
          const active = highlight?.gate_id === g.id;
          return (
            <G key={g.id}>
              <Circle cx={g.x} cy={g.y} r={active ? 12 : 10} fill={closed ? RED : active ? K.gateActive : INK} stroke={K.bg} strokeWidth={2} />
              <SvgText x={g.x} y={g.y + 4} textAnchor="middle" fontSize={active ? 13 : 11} fontFamily={F.display} fill={active ? K.onGateActive : K.onInk}>{closed ? "✕" : g.id.replace("gate_", "")}</SvgText>
              {closed && <SvgText x={g.x + 14} y={g.y + 22} fontSize={8} fontFamily={F.bodyBold} fill={RED}>{`Gate ${g.id.replace("gate_", "")} closed`}</SvgText>}
              {!closed && (gateDelta?.[g.id] ?? 0) > 0 && (
                <G>
                  <Rect x={g.x + 12} y={g.y - 22} width={46} height={14} rx={2} fill={K.gateActive} />
                  <SvgText x={g.x + 35} y={g.y - 12} textAnchor="middle" fontSize={8} fontFamily={F.bodyBold} fill={K.onGateActive}>{`+${gateDelta![g.id].toLocaleString()}`}</SvgText>
                </G>
              )}
            </G>
          );
        })}

        {meet && (
          <G>
            <Circle cx={meet.x + 9} cy={meet.y - 9} r={5} fill={RED} stroke={K.bg} strokeWidth={1.5} />
            <SvgText x={meet.x + 17} y={meet.y - 6} fontSize={8} fontFamily={F.bodyBold} fill={RED}>Meet</SvgText>
          </G>
        )}
        {route && (
          <G>
            <Circle cx={route[0][0]} cy={route[0][1] + 14} r={5.5} fill={K.you} stroke={K.bg} strokeWidth={2} />
            <SvgText x={route[0][0] + 9} y={route[0][1] + 17} fontSize={8} fontFamily={F.bodyBold} fill={K.you}>You</SvgText>
          </G>
        )}
      </G>
    </Svg>
  );
}
