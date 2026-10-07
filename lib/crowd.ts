import fs from "node:fs";
import path from "node:path";
import { site } from "./data";

import { normalizeCrowd, CROWD_COST, type CrowdLevel, type CrowdState } from "./crowd-model";
export type { CrowdLevel, CrowdState } from "./crowd-model";

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
    return {}; // No organizer report yet; clients show Unknown.
  }

  try {
    const saved = normalizeCrowd(JSON.parse(fs.readFileSync(CROWD_PATH, "utf8")));
    return Object.fromEntries(site.routes.flatMap(route => saved[route.id] ? [[route.id, saved[route.id]]] : []));
  } catch {
    return {}; // Unknown conditions, not a fabricated live reading.
  }
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
  return CROWD_COST[level];
}
