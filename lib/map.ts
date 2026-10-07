// Map payload sent to phones (cached offline) and the organiser screen. Server side.
import mapJson from "../data/map.json";
import { site } from "./data";

export type Pt = [number, number];
export type MapData = {
  viewBox: [number, number, number, number];
  site: Pt[];
  river: { label: string; y: number };
  outside: { id: string; x: number; y: number; label: string }[];
  gates: { id: string; x: number; y: number }[];
  places: { id: string; x: number; y: number; label: string; kind: string }[];
  routes: Record<string, Pt[]>;
  connections: Record<string, Pt[]>;
  covered: Record<string, boolean>; // route id / "gate>dest" → covered?
};

export function mapPayload(): MapData {
  const m = mapJson as unknown as Omit<MapData, "covered">;
  const covered: Record<string, boolean> = {};
  for (const r of site.routes) covered[r.id] = r.covered;
  for (const g of site.gates) for (const c of g.connects_to) covered[`${g.id}>${c.id}`] = c.covered;
  return { ...m, covered };
}
