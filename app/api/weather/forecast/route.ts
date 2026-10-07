// Live forecast for tonight's exit window (Meteosource). No AI call.
import { connection } from "next/server";
import { activeScenario, exitForecast } from "@/lib/weather-check";

const local = (iso: string) =>
  new Intl.DateTimeFormat("en-AU", { timeZone: process.env.FESTIVAL_TIMEZONE ?? "Australia/Melbourne", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

export async function GET() {
  await connection();
  const scenario = activeScenario();
  const forecast = await exitForecast(scenario);
  return Response.json(
    { scenario, forecast: { ...forecast, intervals: forecast.intervals.map((i) => ({ ...i, label: `${local(i.start)}–${local(i.end)}` })) } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
