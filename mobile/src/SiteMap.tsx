// Phone version of the site map (react-native-svg). Same data and look as app/components/SiteMap.tsx on the web.
// Drawn from the map saved in the plan bundle, so it works in airplane mode.
import Svg, { Circle, G, Path, Polygon, Polyline, Rect, Text as SvgText } from "react-native-svg";

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

const INK = "#141414";
const RED = "#DC2626";
const PAD = 48;
const pts = (p: Pt[]) => p.map((q) => q.join(",")).join(" ");

export default function SiteMap({ map, closedGates = [], closedPlaces = [], storm, highlight, gateDelta }: Props) {
  const [, , W0, H] = map.viewBox;
  const W = W0 + PAD;
  const pos = (id: string) => map.gates.find((g) => g.id === id) ?? map.places.find((p) => p.id === id) ?? map.outside.find((o) => o.id === id);
  const conn = highlight?.dest_id ? map.connections[`${highlight.gate_id}>${highlight.dest_id}`] : undefined;
  const meet = highlight?.meetup_id ? pos(highlight.meetup_id) : undefined;
  const route = highlight ? map.routes[highlight.route_id] : undefined;

  return (
    <Svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ aspectRatio: W / H }}>
      <Rect x={0} y={0} width={W} height={H} fill="#F5F4F0" />
      <Path d={`M0 ${map.river.y - 10} Q ${W / 2} ${map.river.y - 2} ${W} ${map.river.y - 12} L ${W} ${H} L 0 ${H} Z`} fill="#D6E6F2" />
      <SvgText x={W - 12} y={map.river.y + 16} textAnchor="end" fontSize={9} fill="#5B7A93" fontStyle="italic">{map.river.label}</SvgText>
      <G transform={`translate(${PAD},0)`}>
        <Polygon points={pts(map.site)} fill="#E6EDD8" stroke="#C9D4B4" strokeWidth={1.5} />

        {Object.entries(map.routes).map(([id, p]) => (
          <Polyline key={id} points={pts(p)} fill="none" stroke={map.covered[id] ? "#9C978C" : "#B9B4A9"} strokeWidth={map.covered[id] ? 2.5 : 1.5} strokeDasharray={map.covered[id] ? undefined : "4 3"} opacity={highlight ? 0.35 : storm && !map.covered[id] ? 0.25 : 0.9} />
        ))}
        {Object.entries(map.connections).map(([id, p]) => (
          <Polyline key={id} points={pts(p)} fill="none" stroke="#B9B4A9" strokeWidth={1} strokeDasharray="2 3" opacity={storm && !map.covered[id] ? 0.15 : 0.35} />
        ))}

        {route && <Polyline points={pts(route)} fill="none" stroke={INK} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />}
        {conn && <Polyline points={pts(conn)} fill="none" stroke={INK} strokeWidth={3} strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" />}

        {map.places.map((p) => {
          if (p.kind === "info") return <Circle key={p.id} cx={p.x} cy={p.y} r={4} fill="#fff" stroke="#9C978C" />;
          const big = p.kind === "stage";
          const w = p.label.length * (big ? 5.4 : 4.6) + 10;
          return (
            <G key={p.id}>
              <Rect x={p.x - w / 2} y={p.y - 8} width={w} height={16} rx={8} fill={big ? "#fff" : "#F5F4F0"} stroke="#C9C4B8" />
              <SvgText x={p.x} y={p.y + 3.5} textAnchor="middle" fontSize={big ? 9 : 8} fontWeight={big ? "700" : "500"} fill={INK}>{p.label}</SvgText>
            </G>
          );
        })}

        {map.outside.map((o) => {
          const closed = closedPlaces.includes(o.id);
          const isDest = highlight?.dest_id === o.id;
          const w = o.label.length * 4.6 + 10;
          return (
            <G key={o.id}>
              <Rect x={o.x - w / 2} y={o.y - 8} width={w} height={16} rx={4} fill={isDest ? INK : closed ? "#FDECEC" : "#fff"} stroke={closed ? RED : "#C9C4B8"} />
              <SvgText x={o.x} y={o.y + 3} textAnchor="middle" fontSize={8} fontWeight="600" fill={isDest ? "#fff" : closed ? RED : INK}>{closed ? `✕ ${o.label}` : o.label}</SvgText>
            </G>
          );
        })}

        {map.gates.map((g) => {
          const closed = closedGates.includes(g.id);
          const active = highlight?.gate_id === g.id;
          return (
            <G key={g.id}>
              <Circle cx={g.x} cy={g.y} r={active ? 12 : 10} fill={closed ? RED : active ? "#FFD400" : INK} stroke="#fff" strokeWidth={2} />
              <SvgText x={g.x} y={g.y + 4} textAnchor="middle" fontSize={active ? 13 : 11} fontWeight="900" fill={active ? INK : "#fff"}>{closed ? "✕" : g.id.replace("gate_", "")}</SvgText>
              {closed && <SvgText x={g.x + 14} y={g.y + 22} fontSize={8} fontWeight="800" fill={RED}>{`Gate ${g.id.replace("gate_", "")} closed`}</SvgText>}
              {!closed && (gateDelta?.[g.id] ?? 0) > 0 && (
                <G>
                  <Rect x={g.x + 12} y={g.y - 22} width={46} height={14} rx={7} fill="#FFD400" />
                  <SvgText x={g.x + 35} y={g.y - 12} textAnchor="middle" fontSize={8} fontWeight="800" fill={INK}>{`+${gateDelta![g.id].toLocaleString()}`}</SvgText>
                </G>
              )}
            </G>
          );
        })}

        {meet && (
          <G>
            <Circle cx={meet.x + 9} cy={meet.y - 9} r={5} fill={RED} stroke="#fff" strokeWidth={1.5} />
            <SvgText x={meet.x + 17} y={meet.y - 6} fontSize={8} fontWeight="800" fill={RED}>Meet</SvgText>
          </G>
        )}
        {route && (
          <G>
            <Circle cx={route[0][0]} cy={route[0][1] + 14} r={5.5} fill="#2563EB" stroke="#fff" strokeWidth={2} />
            <SvgText x={route[0][0] + 9} y={route[0][1] + 17} fontSize={8} fontWeight="800" fill="#2563EB">You</SvgText>
          </G>
        )}
      </G>
    </Svg>
  );
}
