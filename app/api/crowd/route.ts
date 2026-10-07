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
  const body = await req.json();

  if (body.action === "reset") {
    return Response.json({
      crowd: resetCrowd(),
    });
  }

  const routeId = body.route_id;
  const level = body.level as CrowdLevel;

  if (!site.routes.some((r) => r.id === routeId)) {
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