// Organizer-triggered weather check: Claude re-ranks journeys for the forecast; changes become proposals.
import { runWeatherCheck } from "@/lib/weather-check";

export async function POST() {
  try {
    return Response.json(await runWeatherCheck(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Weather check failed" }, { status: 500 });
  }
}
