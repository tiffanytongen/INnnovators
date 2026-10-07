// Ticket checkout (3 optional journey questions) → profile. Plan A is generated now; the disruption plans continue in the background.
import { loadProfiles, saveProfiles, scenarios, type Profile } from "@/lib/data";
import { generatePlan, writePlan } from "@/lib/generate";

export async function POST(req: Request) {
  const body = await req.json();
  const profiles = loadProfiles();
  const base = String(body.name || "guest").toLowerCase().replace(/[^a-z]/g, "") || "guest";
  let id = `${base}_${Math.floor(Math.random() * 900 + 100)}`;
  while (profiles.some((p) => p.id === id)) id = `${base}_${Math.floor(Math.random() * 900 + 100)}`;

  const step_free = !!body.wheelchair || !!body.step_free;
  const profile: Profile = {
    id,
    name: String(body.name || "Guest").slice(0, 30),
    age: Number(body.age) || 20,
    lang: body.lang || "en",
    home:
      body.mode === "shuttle" ? { mode: "shuttle", booking: step_free ? "shuttle_acc_2245" : "shuttle_gen_2250" }
      : body.mode === "pickup" ? { mode: "pickup", zone: body.zone || "pickup_zone_2", contact: body.contact || "parent" }
      : { mode: "train", line: body.line || "Sandringham" },
    access: { wheelchair: !!body.wheelchair, step_free, low_vision: !!body.low_vision, sensory: !!body.sensory },
    under_18: Number(body.age) < 18,
    first_timer: !!body.first_timer,
    medical_flag: null, // medical info is collected by staff, not this form
    group: Number(body.group_size) > 1 ? { id: `grp_${id}`, size: Number(body.group_size) } : null,
    location_at_end: step_free ? "accessible_platform" : "river_stage",
    must_see: [],
    weight: 1,
    ...(body.suburb ? { home_suburb: String(body.suburb).slice(0, 60) } : {}),
    ...(/^\d{2}:\d{2}$/.test(body.leave_by ?? "") ? { preferences: { latest_arrival: body.leave_by } } : {}),
  };
  saveProfiles([...profiles, profile]);

  try {
    const planA = await generatePlan(profile, "NORMAL");
    if (planA) writePlan(planA);
  } catch (e) {
    console.error("Plan A generation failed", e);
  }
  // Background: every disruption plan (one at a time, so the plan file isn't written concurrently).
  void (async () => {
    for (const sc of scenarios.precompute.filter((s) => s !== "NORMAL")) {
      try {
        const plan = await generatePlan(profile, sc);
        if (plan) writePlan(plan);
      } catch (e) {
        console.error(`Plan ${sc} failed for ${id}`, e);
      }
    }
  })();
  return Response.json({ id });
}
