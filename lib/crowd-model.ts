// Shared wire/cache boundary; deliberately has no server or native dependencies.
export type CrowdLevel = "low" | "moderate" | "heavy" | "closed";
export type CrowdState = Record<string, { level: CrowdLevel; updated_at: string }>;
export const CROWD_LABELS: Record<CrowdLevel, string> = {
  low: "🟢 Low", moderate: "🟡 Moderate", heavy: "🔴 Heavy", closed: "⛔ Closed",
};
export const CROWD_COST: Record<CrowdLevel, number> = {
  low: 0, moderate: 4, heavy: 12, closed: Infinity,
};
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
export function normalizeCrowd(value: unknown): CrowdState {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([id, state]) => {
    if (!isRecord(state) || typeof state.level !== "string" ||
      !Object.hasOwn(CROWD_COST, state.level)) return [];
    return [[id, {
      level: state.level as CrowdLevel,
      updated_at: typeof state.updated_at === "string" && Number.isFinite(Date.parse(state.updated_at)) ? state.updated_at : ""
    }]];
  }));
}
