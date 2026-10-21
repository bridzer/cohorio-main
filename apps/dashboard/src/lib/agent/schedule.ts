export type AutomationFrequency = "daily" | "weekly";

export type AutomationSchedule = {
  frequency: AutomationFrequency;
  /** 0 = Sunday … 6 = Saturday. Required for weekly, null for daily. */
  weekday: number | null;
  /** Local hour in the schedule's timezone, 0–23. Runs on the hour. */
  hour: number;
  timezone: string;
};

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function isValidTimezone(timezone: string) {
  if (!timezone || timezone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function zonedParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

/** Milliseconds the zone is ahead of UTC at the given instant. */
function zoneOffset(date: Date, timezone: string) {
  const parts = zonedParts(date, timezone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * The instant at which the wall clock in `timezone` reads the given local time.
 * Times skipped by a DST jump resolve to the first valid instant after the gap.
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  timezone: string,
) {
  const wall = Date.UTC(year, month - 1, day, hour);
  let instant = wall - zoneOffset(new Date(wall), timezone);
  const corrected = wall - zoneOffset(new Date(instant), timezone);
  if (corrected !== instant) {
    instant = corrected;
    // Inside a spring-forward gap neither offset reproduces the wall time; take the later one.
    if (zonedParts(new Date(instant), timezone).hour !== hour) {
      instant = Math.max(instant, wall - zoneOffset(new Date(wall), timezone));
    }
  }
  return new Date(instant);
}

/** The first scheduled instant strictly after `after`. */
export function nextRunAt(schedule: AutomationSchedule, after: Date = new Date()) {
  const local = zonedParts(after, schedule.timezone);
  for (let offset = 0; offset <= 8; offset += 1) {
    const day = new Date(Date.UTC(local.year, local.month - 1, local.day + offset));
    if (schedule.frequency === "weekly" && day.getUTCDay() !== schedule.weekday) continue;
    const candidate = zonedTimeToUtc(
      day.getUTCFullYear(),
      day.getUTCMonth() + 1,
      day.getUTCDate(),
      schedule.hour,
      schedule.timezone,
    );
    if (candidate.getTime() > after.getTime()) return candidate;
  }
  throw new Error("Could not compute the next run for this schedule.");
}

export function describeSchedule(schedule: AutomationSchedule) {
  const time = `${String(schedule.hour).padStart(2, "0")}:00`;
  const when =
    schedule.frequency === "daily"
      ? `Every day at ${time}`
      : `Every ${WEEKDAYS[schedule.weekday ?? 0]} at ${time}`;
  return `${when} (${schedule.timezone})`;
}
