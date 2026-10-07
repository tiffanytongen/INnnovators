// Schematic site map (pure SVG, works offline). Shows closed gates/places, and optionally one person's route out.
import type { MapData, Pt } from "@/lib/map";

type Props = {
  map: MapData;
  closedGates?: string[];
  closedPlaces?: string[];
  storm?: boolean;
  highlight?: { route_id: string; gate_id: string; dest_id?: string; meetup_id?: string | null } | null;
  gateDelta?: Record<string, number>; // organiser view: people gained/lost per gate
  className?: string;
};

const INK = "#141414";
const RED = "#DC2626";
const line = (pts: Pt[]) => pts.map((p) => p.join(",")).join(" ");

export default function SiteMap({ map, closedGates = [], closedPlaces = [], storm, highlight, gateDelta, className }: Props) {
  const [, , W0, H] = map.viewBox;
  const PAD = 48; // room on the left for the street-side labels
  const W = W0 + PAD;
  const pos = (id: string) => map.gates.find((g) => g.id === id) ?? map.places.find((p) => p.id === id) ?? map.outside.find((o) => o.id === id);
  const conn = highlight?.dest_id ? map.connections[`${highlight.gate_id}>${highlight.dest_id}`] : undefined;
  const meet = highlight?.meetup_id ? pos(highlight.meetup_id) : undefined;
  const dest = highlight?.dest_id ? pos(highlight.dest_id) : undefined;
  const dim = !!highlight;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label="Festival site map">
      <rect x={0} y={0} width={W} height={H} fill="#F5F4F0" />
      {/* river */}
      <path d={`M0 ${map.river.y - 10} Q ${W / 2} ${map.river.y - 2} ${W} ${map.river.y - 12} L ${W} ${H} L 0 ${H} Z`} fill="#D6E6F2" />
      <text x={W - 12} y={map.river.y + 16} textAnchor="end" fontSize={9} fill="#5B7A93" fontStyle="italic">{map.river.label}</text>
      <g transform={`translate(${PAD},0)`}>
      {/* site */}
      <polygon points={line(map.site)} fill="#E6EDD8" stroke="#C9D4B4" strokeWidth={1.5} />
      {storm && <text x={362} y={60} textAnchor="end" fontSize={10} fill="#5B7A93">🌧 storm: covered paths only</text>}

      {/* all routes + exits, faint */}
      {Object.entries(map.routes).map(([id, pts]) => {
        const covered = map.covered[id];
        return <polyline key={id} points={line(pts)} fill="none" stroke={covered ? "#9C978C" : "#B9B4A9"} strokeWidth={covered ? 2.5 : 1.5} strokeDasharray={covered ? undefined : "4 3"} opacity={dim ? 0.35 : storm && !covered ? 0.25 : 0.9} strokeLinecap="round" strokeLinejoin="round" />;
      })}
      {Object.entries(map.connections).map(([id, pts]) => (
        <polyline key={id} points={line(pts)} fill="none" stroke="#B9B4A9" strokeWidth={1} strokeDasharray="2 3" opacity={dim ? 0.3 : storm && !map.covered[id] ? 0.25 : 0.7} />
      ))}

      {/* highlighted route out */}
      {highlight && map.routes[highlight.route_id] && (
        <polyline points={line(map.routes[highlight.route_id])} fill="none" stroke={INK} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
      )}
      {conn && <polyline points={line(conn)} fill="none" stroke={INK} strokeWidth={3} strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" />}

      {/* places */}
      {map.places.map((p) => {
        if (p.kind === "info") return <g key={p.id}><circle cx={p.x} cy={p.y} r={5} fill="#fff" stroke="#9C978C" /><text x={p.x} y={p.y + 3} textAnchor="middle" fontSize={7} fontWeight={700} fill="#6B6862">i</text></g>;
        const big = p.kind === "stage";
        const w = p.label.length * (big ? 5.4 : 4.6) + 10;
        return (
          <g key={p.id}>
            <rect x={p.x - w / 2} y={p.y - 8} width={w} height={16} rx={8} fill={big ? "#fff" : "#F5F4F0"} stroke="#C9C4B8" />
            <text x={p.x} y={p.y + 3.5} textAnchor="middle" fontSize={big ? 9 : 8} fontWeight={big ? 700 : 500} fill={INK}>{p.kind === "access" ? "♿ " : ""}{p.label}</text>
          </g>
        );
      })}

      {/* outside destinations */}
      {map.outside.map((o) => {
        const closed = closedPlaces.includes(o.id);
        const w = o.label.length * 4.6 + 10;
        const isDest = highlight?.dest_id === o.id;
        return (
          <g key={o.id}>
            <rect x={o.x - w / 2} y={o.y - 8} width={w} height={16} rx={4} fill={isDest ? INK : closed ? "#FDECEC" : "#fff"} stroke={closed ? RED : "#C9C4B8"} />
            <text x={o.x} y={o.y + 3} textAnchor="middle" fontSize={8} fontWeight={600} fill={isDest ? "#fff" : closed ? RED : INK} textDecoration={closed ? "line-through" : undefined}>{o.label}</text>
          </g>
        );
      })}

      {/* gates */}
      {map.gates.map((g) => {
        const closed = closedGates.includes(g.id);
        const active = highlight?.gate_id === g.id;
        const d = gateDelta?.[g.id] ?? 0;
        return (
          <g key={g.id}>
            <circle cx={g.x} cy={g.y} r={active ? 12 : 10} fill={closed ? RED : active ? "#FFD400" : INK} stroke="#fff" strokeWidth={2} />
            <text x={g.x} y={g.y + 4} textAnchor="middle" fontSize={active ? 13 : 11} fontWeight={900} fill={active ? INK : "#fff"}>{closed ? "✕" : g.id.replace("gate_", "")}</text>
            {closed && <text x={g.x + 14} y={g.y + 22} fontSize={8} fontWeight={800} fill={RED}>Gate {g.id.replace("gate_", "")} closed</text>}
            {!closed && d !== 0 && (
              <g>
                <rect x={g.x + 12} y={g.y - 22} width={44} height={14} rx={7} fill={d > 0 ? "#FFD400" : "#E7E4DD"} />
                <text x={g.x + 34} y={g.y - 12} textAnchor="middle" fontSize={8} fontWeight={800} fill={INK}>{d > 0 ? "+" : ""}{d.toLocaleString()}</text>
              </g>
            )}
          </g>
        );
      })}

      {/* pins */}
      {dest && <text x={dest.x} y={dest.y - 11} textAnchor="middle" fontSize={13}>🏁</text>}
      {meet && <text x={meet.x + 9} y={meet.y - 4} textAnchor="middle" fontSize={12}>📍</text>}
      {highlight && map.routes[highlight.route_id] && (() => {
        const [x, y] = map.routes[highlight.route_id][0];
        // "You" sits just under the start label so it doesn't hide the name
        return <g><circle cx={x} cy={y + 14} r={5.5} fill="#2563EB" stroke="#fff" strokeWidth={2} /><text x={x + 9} y={y + 17} fontSize={8} fontWeight={800} fill="#2563EB">You</text></g>;
      })()}
      </g>
    </svg>
  );
}
