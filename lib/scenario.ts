// Scenario codes, e.g. "STORM+GATE_A+TRAIN_SAND_25+SHUTTLE_FULL".
// Pure functions with no data imports, so the attendee page (client) can use them offline too.

export type ScenarioPart =
  | { type: "STORM"; at: string }
  | { type: "GATE_CLOSED"; gate: string } // "A".."D"
  | { type: "TRAIN_DELAY"; line_code: string; mins: number }
  | { type: "SHUTTLE_FULL" }
  | { type: "HEAT" }
  | { type: "SET_DELAY"; stage: string; mins: number } // stage "RIVER" | "LAWN" | "TENT"
  // Not in the pre-made contingency plans: only handled by live AI replanning.
  | { type: "PATH_CLOSED"; route: string } // a walking route id, e.g. "route_B_canopy"
  | { type: "PLACE_CLOSED"; place: string }; // a pickup zone / shuttle stop / taxi rank id

const ORDER = ["STORM", "GATE_CLOSED", "TRAIN_DELAY", "SHUTTLE_FULL", "HEAT", "SET_DELAY", "PATH_CLOSED", "PLACE_CLOSED"];

// Labels for the closable paths and places (kept here so phones can describe them offline).
const ROUTE_LABELS: Record<string, string> = {
  route_A_open: "Riverside path to Gate A", route_B_lawn: "Lawn path to Gate B", route_B_canopy: "Canopy walk to Gate B",
  covered_path_2: "Covered path to Gate C", route_C_open: "Open path to Gate C", ramp_path_D: "Ramp path to Gate D",
};
const PLACE_LABELS: Record<string, string> = {
  pickup_zone_1: "Pickup Zone 1", pickup_zone_2: "Pickup Zone 2", pickup_zone_3: "Pickup Zone 3",
  shuttle_stop_batman_ave: "Batman Ave shuttle stop", accessible_taxi_rank: "Accessible taxi rank", coach_bays: "Coach bays",
};
export const CLOSABLE_ROUTES = Object.keys(ROUTE_LABELS);
export const CLOSABLE_PLACES = Object.keys(PLACE_LABELS);

export function partToCode(p: ScenarioPart): string {
  switch (p.type) {
    case "STORM": return "STORM";
    case "GATE_CLOSED": return `GATE_${p.gate}`;
    case "TRAIN_DELAY": return `TRAIN_${p.line_code}_${p.mins}`;
    case "SHUTTLE_FULL": return "SHUTTLE_FULL";
    case "HEAT": return "HEAT";
    case "SET_DELAY": return `SET_${p.stage}_${p.mins}`;
    case "PATH_CLOSED": return `PATH_${p.route}`;
    case "PLACE_CLOSED": return `PLACE_${p.place}`;
  }
}

export function codeToPart(code: string): ScenarioPart | null {
  let m;
  if (code === "STORM") return { type: "STORM", at: "23:00" };
  if (code === "SHUTTLE_FULL") return { type: "SHUTTLE_FULL" };
  if (code === "HEAT") return { type: "HEAT" };
  if ((m = code.match(/^GATE_([A-D])$/))) return { type: "GATE_CLOSED", gate: m[1] };
  if ((m = code.match(/^TRAIN_([A-Z]+)_(\d{1,3})$/))) return { type: "TRAIN_DELAY", line_code: m[1], mins: Number(m[2]) };
  if ((m = code.match(/^SET_(RIVER|LAWN|TENT)_(\d{1,3})$/))) return { type: "SET_DELAY", stage: m[1], mins: Number(m[2]) };
  if ((m = code.match(/^PATH_([a-z][A-Za-z0-9_]*)$/)) && ROUTE_LABELS[m[1]]) return { type: "PATH_CLOSED", route: m[1] };
  if ((m = code.match(/^PLACE_([a-z][A-Za-z0-9_]*)$/)) && PLACE_LABELS[m[1]]) return { type: "PLACE_CLOSED", place: m[1] };
  return null;
}

/** Parses a full scenario code. "NORMAL" (or "") = no parts = Plan A. Returns null if any part is unknown. */
export function parseScenario(code: string): ScenarioPart[] | null {
  if (!code || code === "NORMAL") return [];
  const parts = code.split("+").map(codeToPart);
  return parts.some((p) => !p) ? null : (parts as ScenarioPart[]);
}

/** Stable order so the same situation always has the same code (= same cache key). */
export function canonical(parts: ScenarioPart[]): string {
  if (parts.length === 0) return "NORMAL";
  const codes = [...new Set(parts.map(partToCode))];
  codes.sort((a, b) => {
    const ta = ORDER.indexOf(codeToPart(a)!.type), tb = ORDER.indexOf(codeToPart(b)!.type);
    return ta - tb || a.localeCompare(b);
  });
  return codes.join("+");
}

export const canonicalCode = (code: string) => {
  const parts = parseScenario(code);
  return parts ? canonical(parts) : null;
};

/**
 * Pick the cached plan for a trigger. Exact match first; otherwise the cached scenario
 * that covers the most parts of the trigger without including anything that isn't happening.
 * Returns the key used and whether it was a fallback.
 */
export function pickCachedScenario(trigger: string, cachedKeys: string[]): { key: string; exact: boolean } {
  const want = canonicalCode(trigger) ?? "NORMAL";
  if (cachedKeys.includes(want)) return { key: want, exact: true };
  const wantSet = new Set(want === "NORMAL" ? [] : want.split("+"));
  let best = { key: "NORMAL", score: 0 };
  for (const k of cachedKeys) {
    if (k === "NORMAL") continue;
    const parts = k.split("+");
    if (!parts.every((p) => wantSet.has(p))) continue; // never apply a disruption that isn't happening
    if (parts.length > best.score) best = { key: k, score: parts.length };
  }
  return { key: best.key, exact: false };
}

const LINE_NAMES: Record<string, string> = { SAND: "Sandringham", FRANK: "Frankston", BELG: "Belgrave", LILY: "Lilydale", CRAIG: "Craigieburn", WERR: "Werribee", HURST: "Hurstbridge", PAK: "Pakenham" };
const cap = (s: string) => s[0] + s.slice(1).toLowerCase();

export function describePart(p: ScenarioPart): string {
  switch (p.type) {
    case "STORM": return `Severe weather from ${p.at}`;
    case "GATE_CLOSED": return `Gate ${p.gate} closed`;
    case "TRAIN_DELAY": return `${LINE_NAMES[p.line_code] ?? p.line_code} line +${p.mins} min`;
    case "SHUTTLE_FULL": return "22:45 accessible shuttle full";
    case "HEAT": return "Extreme heat";
    case "SET_DELAY": return `${cap(p.stage)} Stage running ${p.mins} min late`;
    case "PATH_CLOSED": return `${ROUTE_LABELS[p.route] ?? p.route} closed`;
    case "PLACE_CLOSED": return `${PLACE_LABELS[p.place] ?? p.place} closed`;
  }
}
