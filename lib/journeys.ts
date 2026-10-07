// Server-side feasibility only. Weather never chooses or excludes a route here;
// the model compares the resulting combinations against the supplied forecast.
import { site, transport, scenarios, toTime, type Profile, type CapacityConfirmation } from "./data";
import { worldFor, leaveTime, type Transport } from "./options";
import { parseScenario, describePart } from "./scenario";
import { festivalInstant, scheduleMinutes } from "./festival-time";

export type JourneySegment = {
  id: string; from: string; to: string; walk_minutes: number;
  covered: boolean | null; step_free: boolean | null; start: string | null; end: string | null;
};
export type JourneyPeriod = {
  place_id: string; covered: boolean | null; step_free: boolean | null;
  start: string | null; end: string | null;
};
export type JourneyOption = {
  id: string; route_id: string; gate_id: string; departure_id: string; transport: Transport;
  leave_at: string; arrive: string; boarding_deadline: string | null; depart_at: string | null;
  wait_at: string | null; wait_until: string | null;
  segments: JourneySegment[]; waiting_periods: JourneyPeriod[];
  capacity: { status: "confirmed" | "unknown"; available: number | null };
  missing_information: string[];
};
export type JourneyCandidates = {
  options: JourneyOption[]; missing_information: string[]; procedures: string[];
  window: { start: string | null; end: string | null }; festival_date: string | null; timezone: string;
};
export type JourneySettings = {
  festival_date?: string | null; timezone?: string; ready_at?: string; latest_arrival?: string;
  boarding_buffer_minutes?: number; now?: Date; capacity_max_age_minutes?: number;
  /** In-memory fixture overrides; callers must label simulated operational data. */
  site?: typeof site; transport?: typeof transport;
};

const known = (value: unknown): boolean | null => typeof value === "boolean" ? value : null;
const duration = (value: number, pace: number) => Number.isFinite(value) && value >= 0 ? Math.ceil(value * pace) : null;
const unique = (values: string[]) => [...new Set(values)];

function confirmedCapacity(record: CapacityConfirmation | undefined, now: Date, maxAgeMinutes: number): number | null {
  if (!record || !Number.isInteger(record.confirmed_remaining) || record.confirmed_remaining! < 0) return null;
  const confirmedAt = Date.parse(record.capacity_confirmed_at ?? "");
  const validUntil = record.capacity_valid_until ? Date.parse(record.capacity_valid_until) : null;
  if (!Number.isFinite(confirmedAt) || confirmedAt > now.getTime() + 60_000) return null;
  if (validUntil !== null) {
    if (!Number.isFinite(validUntil) || validUntil < now.getTime() || validUntil < confirmedAt) return null;
  } else if (now.getTime() - confirmedAt > maxAgeMinutes * 60_000) return null;
  return record.confirmed_remaining!;
}

/**
 * Enumerate real graph paths, actual departures and approved waiting choices.
 * No score, weather threshold or preferred route is assigned by this function.
 */
export function buildJourneyOptions(profile: Profile, scenario: string, settings: JourneySettings = {}): JourneyCandidates {
  const parts = parseScenario(scenario);
  if (!parts) throw new Error("Unknown disruption scenario");
  const world = worldFor(parts);
  const graph = settings.site ?? site;
  const services = settings.transport ?? transport;
  const timezone = settings.timezone ?? process.env.FESTIVAL_TIMEZONE ?? "Australia/Melbourne";
  const requestedDate = settings.festival_date !== undefined ? settings.festival_date : process.env.FESTIVAL_DATE ?? null;
  const festivalDate = festivalInstant(requestedDate, 12 * 60, timezone) ? requestedDate : null;
  const now = settings.now ?? new Date();
  const maxAge = settings.capacity_max_age_minutes ?? 15;
  const missing: string[] = [];
  const options: JourneyOption[] = [];
  if (!festivalDate) missing.push("Festival date or timezone is missing/invalid; journey weather is unavailable. Today's weather is not substituted.");
  const instant = (minute: number) => festivalInstant(festivalDate, minute, timezone);
  const needStepFree = profile.access.wheelchair || profile.access.step_free;
  const requestedPace = profile.walking_pace_multiplier;
  const pace = requestedPace !== undefined && Number.isFinite(requestedPace) && requestedPace > 0 ? requestedPace : 1;
  if (requestedPace === undefined) missing.push("Individual walking pace is unknown; route reference durations are used without assuming age or mobility implies a pace.");
  else if (pace !== requestedPace) missing.push("Invalid walking pace; reference durations are used and staff must verify walking time.");
  const readyInput = settings.ready_at ?? profile.preferences?.ready_at;
  const ready = scheduleMinutes(readyInput) ?? leaveTime(profile, world);
  if (readyInput && scheduleMinutes(readyInput) === null) missing.push("Invalid ready_at; the existing festival departure time is used.");
  const latestInput = settings.latest_arrival ?? profile.preferences?.latest_arrival;
  const latest = scheduleMinutes(latestInput);
  const groupSize = Math.max(1, profile.group?.size ?? 1);
  const origin = graph.places.find((place) => place.id === profile.location_at_end);
  const closedPlaces = new Set(graph.places.filter((place) => place.closed ||
    (place.via_gates?.length && place.via_gates.every((gate) => world.closedGates.has(gate))) ||
    (world.storm && place.type === "pickup_zone" && place.covered !== true)).map((place) => place.id));
  const procedures = parts.flatMap((part) => {
    const procedure = scenarios.types.find((item) => item.type === part.type);
    return procedure ? [`${describePart(part)} [${procedure.emp_section}]: ${procedure.effects.join("; ")}`] : [];
  });
  if (latestInput && latest === null) missing.push("Invalid latest_arrival; staff must confirm the journey deadline.");
  if (closedPlaces.has(profile.location_at_end)) {
    missing.push("The attendee's current location is closed; staff must establish a safe starting point.");
    return { options, missing_information: unique(missing), procedures, window: { start: null, end: null }, festival_date: festivalDate, timezone };
  }
  const canWaitAtOrigin = origin?.approved_waiting === true && origin.covered === true && origin.step_free === true;
  const stormAt = parts.find((part) => part.type === "STORM");
  const stormDeadline = stormAt?.type === "STORM" ? scheduleMinutes(stormAt.at) : null;

  for (const route of graph.routes) {
    if (!route.from.includes(profile.location_at_end) || route.closed) continue;
    const gate = graph.gates.find((item) => item.id === route.gate_id);
    if (!gate || world.closedGates.has(gate.id)) continue;
    if (needStepFree && (route.step_free !== true || gate.step_free !== true || gate.accessible !== true)) continue;
    // This is a confirmed organiser scenario, never inferred from a raw forecast.
    if (world.storm && route.covered !== true) continue;
    const routeMinutes = duration(route.walk_min, pace);
    if (routeMinutes === null) { missing.push(`${route.id}: walking duration is unknown; route excluded.`); continue; }

    for (const connection of gate.connects_to) {
      if (connection.closed || closedPlaces.has(connection.id)) continue;
      if (needStepFree && connection.step_free !== true) continue;
      if (world.storm && connection.covered !== true) continue;
      const connectionMinutes = duration(connection.walk_min, pace);
      if (connectionMinutes === null) { missing.push(`${gate.id} to ${connection.id}: walking duration is unknown; connection excluded.`); continue; }
      const walk = routeMinutes + connectionMinutes;
      if (profile.preferences?.max_walk_minutes !== undefined && walk > profile.preferences.max_walk_minutes) continue;
      const destination = graph.places.find((item) => item.id === connection.id);
      if (!destination) { missing.push(`${connection.id}: destination metadata is absent; connection excluded.`); continue; }
      const earliestArrival = ready + walk;
      if (latest !== null && earliestArrival > latest) continue;
      const routeMissing: string[] = [];
      for (const [label, metadata] of [[route.id, route], [`${gate.id} to ${connection.id}`, connection], [destination.id, destination]] as const) {
        if (known(metadata.covered) === null) routeMissing.push(`${label}: shelter/exposure is unknown.`);
        if (known(metadata.step_free) === null) routeMissing.push(`${label}: step-free access is unknown.`);
      }
      if (needStepFree && destination.step_free !== true && destination.type === "pickup_zone") continue;

      const add = (journeyTransport: Transport, departureId: string, depart: number | null, deadline: number | null,
        capacity: JourneyOption["capacity"], transportMissing: string[], pickupWindowEnd?: number) => {
        if (deadline !== null && earliestArrival > deadline) return;
        if (latest !== null && earliestArrival > latest) return;
        // Do not promise shelter beyond the time the approved storm procedure requires it.
        if (stormDeadline !== null && (depart === null || depart > stormDeadline) && destination.covered !== true) return;
        const latestLeave = Math.min(deadline === null ? ready : deadline - walk, latest === null ? Infinity : latest - walk);
        const leaves = new Set([ready]);
        // Delay only at an explicitly approved, accessible covered current location.
        if (canWaitAtOrigin && latestLeave > ready) {
          leaves.add(Math.floor((ready + latestLeave) / 2));
          leaves.add(latestLeave);
        }
        for (const leave of leaves) {
          const arrive = leave + walk;
          const waitAt = leave > ready ? profile.location_at_end : null;
          const waiting: JourneyPeriod[] = [];
          if (waitAt) waiting.push({ place_id: waitAt, covered: true, step_free: true, start: instant(ready), end: instant(leave) });
          // Destination waiting includes boarding time, so forecast coverage cannot end at arrival.
          const waitEnd = depart ?? pickupWindowEnd ?? arrive;
          if (waitEnd > arrive) waiting.push({ place_id: destination.id, covered: known(destination.covered), step_free: known(destination.step_free), start: instant(arrive), end: instant(waitEnd) });
          const segments: JourneySegment[] = [
            { id: route.id, from: profile.location_at_end, to: gate.id, walk_minutes: routeMinutes, covered: known(route.covered), step_free: known(route.step_free), start: instant(leave), end: instant(leave + routeMinutes) },
            { id: `${gate.id}>${connection.id}`, from: gate.id, to: connection.id, walk_minutes: connectionMinutes, covered: known(connection.covered), step_free: known(connection.step_free), start: instant(leave + routeMinutes), end: instant(arrive) },
          ];
          options.push({
            id: `${route.id}|${departureId}|${toTime(leave)}|${waitAt ?? "direct"}`,
            route_id: route.id, gate_id: gate.id, departure_id: departureId, transport: journeyTransport,
            leave_at: toTime(leave), arrive: toTime(arrive), boarding_deadline: deadline === null ? null : toTime(deadline),
            depart_at: depart === null ? null : toTime(depart), wait_at: waitAt, wait_until: waitAt ? toTime(leave) : null,
            segments, waiting_periods: waiting, capacity,
            missing_information: unique([...routeMissing, ...transportMissing]),
          });
        }
      };

      if (destination.id === services.station_id && profile.home.mode === "train") {
        const homeLine = profile.home.line;
        const train = services.trains.find((item) => item.line === homeLine);
        if (!train) { missing.push(`No timetable is available for ${homeLine}.`); continue; }
        if (needStepFree && train.step_free !== true) {
          missing.push(`${train.line}: step-free train boarding is unconfirmed; staff review required.`); continue;
        }
        for (const timetabled of train.departures) {
          const scheduled = scheduleMinutes(timetabled);
          if (scheduled === null) continue;
          const depart = scheduled + (world.delays[train.code] ?? 0);
          const buffer = train.boarding_buffer_minutes ?? settings.boarding_buffer_minutes ?? 3;
          if (!Number.isFinite(buffer) || buffer < 0) continue;
          const remaining = confirmedCapacity(train.departure_capacity?.[timetabled], now, maxAge);
          if (remaining !== null && remaining < groupSize) continue;
          if (profile.preferences?.seat_required && remaining === null) {
            missing.push(`${train.line} ${timetabled}: a required seat has not been confirmed; departure excluded.`); continue;
          }
          const unknown = remaining === null ? ["Public unreserved train: seats and boarding space are unconfirmed; a timetable is not a capacity guarantee."] : [];
          add({ mode: "train", ref_id: `train_${train.code}`, line: train.line, platform: String(train.platform), depart: toTime(depart) },
            `train_${train.code}_${timetabled}`, depart, depart - buffer,
            { status: remaining === null ? "unknown" : "confirmed", available: remaining }, unknown);
        }
      }

      if ((destination.type === "shuttle_stop" || destination.type === "taxi_rank") && profile.home.mode !== "pickup") {
        for (const service of [...services.shuttles, ...services.taxis]) {
          if (service.stop_id !== destination.id || service.cancelled || world.fullServices.has(service.id)) continue;
          if (needStepFree && !(service.step_free === true || service.kind === "accessible" || service.kind === "accessible_taxi")) continue;
          if (!needStepFree && service.kind !== "general") continue;
          const depart = scheduleMinutes(service.depart);
          const buffer = service.boarding_buffer_minutes ?? settings.boarding_buffer_minutes ?? 2;
          const deadline = service.boarding_deadline ? scheduleMinutes(service.boarding_deadline) : depart === null ? null : depart - buffer;
          if (depart === null || deadline === null || !Number.isFinite(buffer) || buffer < 0 || deadline > depart || earliestArrival > deadline) continue;
          const remaining = confirmedCapacity(service, now, maxAge);
          if (remaining === null) {
            missing.push(`${service.id}: confirmed remaining seats and a current capacity timestamp are missing; nominal capacity (${service.capacity}) is not availability. Staff must confirm before recommending it.`); continue;
          }
          if (remaining < groupSize) { missing.push(`${service.id}: insufficient confirmed remaining seats for this attendee/group.`); continue; }
          add({ mode: service.kind === "accessible_taxi" ? "taxi" : "shuttle", ref_id: service.id, line: service.name, platform: service.stop_id, depart: service.depart },
            service.id, depart, deadline, { status: "confirmed", available: remaining }, []);
        }
      }

      if (destination.type === "pickup_zone" && profile.home.mode === "pickup") {
        const pickup = services.pickup.find((item) => item.zone_id === destination.id);
        const [opens, closes] = (pickup?.window ?? "").split("-").map(scheduleMinutes);
        if (opens === null || closes === null || opens === undefined || closes === undefined || earliestArrival < opens || earliestArrival > closes) continue;
        add({ mode: "pickup", ref_id: destination.id, line: `${profile.home.contact} pickup`, platform: destination.id, depart: null },
          `pickup_${destination.id}_${pickup!.window}`, null, closes, { status: "unknown", available: null },
          ["Pickup driver's arrival and vehicle capacity are not confirmed. Weather exposure is assessed through the remaining pickup window; this is not a promised boarding time.",
            ...(profile.home.zone !== destination.id ? ["Pickup point changes: contact agreement is required; no message delivery or driver agreement is assumed."] : [])], closes);
      }
    }
  }
  const deduplicated = [...new Map(options.map((option) => [option.id, option])).values()];
  const starts = deduplicated.flatMap((option) => [...option.segments, ...option.waiting_periods].flatMap((period) => period.start ? [period.start] : []));
  const ends = deduplicated.flatMap((option) => [...option.segments, ...option.waiting_periods].flatMap((period) => period.end ? [period.end] : []));
  return {
    options: deduplicated, missing_information: unique(missing), procedures,
    window: { start: starts.length ? starts.sort()[0] : null, end: ends.length ? ends.sort().at(-1)! : null },
    festival_date: festivalDate, timezone,
  };
}
