/** Convert a festival schedule minute (including 24:xx) to an instant in its IANA timezone. */
export function festivalInstant(festivalDate: string | null, minutes: number, timezone: string): string | null {
  if (!festivalDate || !/^\d{4}-\d{2}-\d{2}$/.test(festivalDate) || !Number.isFinite(minutes)) return null;
  const midnight = Date.parse(`${festivalDate}T00:00:00Z`);
  if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== festivalDate) return null;
  const target = midnight + Math.round(minutes) * 60_000;
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    });
    const localEpoch = (instant: number) => {
      const fields = Object.fromEntries(formatter.formatToParts(new Date(instant)).map((p) => [p.type, p.value]));
      return Date.UTC(Number(fields.year), Number(fields.month) - 1, Number(fields.day), Number(fields.hour), Number(fields.minute), Number(fields.second));
    };
    let instant = target;
    for (let i = 0; i < 4; i++) instant += target - localEpoch(instant);
    // A nonexistent local time during a daylight-saving jump must stay unknown.
    return localEpoch(instant) === target ? new Date(instant).toISOString() : null;
  } catch {
    return null;
  }
}

export function scheduleMinutes(value: string | undefined): number | null {
  if (!value || !/^\d{2}:[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}
