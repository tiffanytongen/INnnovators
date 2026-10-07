import fs from "node:fs";
import path from "node:path";
import { site } from "./data";

export type CrowdLevel = "low" | "moderate" | "heavy" | "closed";

export type CrowdRouteState = {
  level: CrowdLevel;
  updated_at: string;
};

export type CrowdState = Record<string, CrowdRouteState>;

const CROWD_PATH = path.join(
  process.cwd(),
  "data",
  "state",
  "crowd.json"
);

function defaultCrowdState(): CrowdState {
  const now = new Date().toISOString();

  return Object.fromEntries(
    site.routes.map((route) => [
      route.id,
      {
        level: "low" as CrowdLevel,
        updated_at: now,
      },
    ])
  );
}

export function readCrowd(): CrowdState {
  if (!fs.existsSync(CROWD_PATH)) {
    return defaultCrowdState();
  }

  return JSON.parse(fs.readFileSync(CROWD_PATH, "utf8"));
}

export function setCrowdLevel(
  routeId: string,
  level: CrowdLevel
): CrowdState {
  const state = readCrowd();

  state[routeId] = {
    level,
    updated_at: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(CROWD_PATH), {
    recursive: true,
  });

  fs.writeFileSync(
    CROWD_PATH,
    JSON.stringify(state, null, 2)
  );

  return state;
}

export function resetCrowd(): CrowdState {
  const state = defaultCrowdState();

  fs.mkdirSync(path.dirname(CROWD_PATH), {
    recursive: true,
  });

  fs.writeFileSync(
    CROWD_PATH,
    JSON.stringify(state, null, 2)
  );

  return state;
}

export function crowdPenalty(level: CrowdLevel): number {
  switch (level) {
    case "low":
      return 0;

    case "moderate":
      return 4;

    case "heavy":
      return 12;

    case "closed":
      return Infinity;
  }
}