import { connection } from "next/server";
import { site } from "@/lib/data";
import {
  readCrowd,
  setCrowdLevel,
  resetCrowd,
  type CrowdLevel,
} from "@/lib/crowd";

const LEVELS: CrowdLevel[] = [
  "low",
  "moderate",
  "heavy",
  "closed",
];

export async function GET() {
  await connection();

  return Response.json({
    crowd: readCrowd(),
  });
}

export async function POST(req: Request) {
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Expected a JSON object" }, { status: 400 });
  }
  const input = body as Record<string, unknown>;

  if (input.action === "reset") {
    return Response.json({
      crowd: resetCrowd(),
    });
  }

  const routeId = input.route_id;
  const level = input.level as CrowdLevel;

  if (typeof routeId !== "string" || !site.routes.some((r) => r.id === routeId)) {
    return Response.json(
      { error: "Unknown route" },
      { status: 400 }
    );
  }

  if (!LEVELS.includes(level)) {
    return Response.json(
      { error: "Invalid crowd level" },
      { status: 400 }
    );
  }

  return Response.json({
    crowd: setCrowdLevel(routeId, level),
  });
}
