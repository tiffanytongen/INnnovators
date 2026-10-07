// Run the organizer weather check from the terminal: npm run weather:check
import { config } from "dotenv";
config({ path: ".env.local" });
import { runWeatherCheck } from "../lib/weather-check";

runWeatherCheck().then(({ scenario, forecast, results }) => {
  console.log(`Situation: ${scenario}`);
  console.log(`Forecast: ${forecast?.status} (${forecast?.source})${forecast?.reason ? ` — ${forecast.reason}` : ""}`);
  for (const i of forecast?.intervals ?? []) console.log(`  ${i.start.slice(11, 16)}Z ${i.summary ?? ""} rain ${i.precipitation ?? "?"}mm/h ${i.rain_probability ?? "?"}% wind ${i.wind_speed ?? "?"}m/s ${i.temperature ?? "?"}°C`);
  for (const r of results) console.log(`${r.outcome.toUpperCase().padEnd(13)} ${r.name}: ${r.detail}`);
});
