import { describe, expect, it } from "vitest";
import { describeSchedule, isValidTimezone, nextRunAt, zonedTimeToUtc } from "./schedule";

const at = (iso: string) => new Date(iso);

describe("zonedTimeToUtc", () => {
  it("converts wall-clock time in a zone to UTC on both sides of DST", () => {
    expect(zonedTimeToUtc(2026, 1, 15, 9, "America/New_York").toISOString()).toBe("2026-01-15T14:00:00.000Z");
    expect(zonedTimeToUtc(2026, 7, 15, 9, "America/New_York").toISOString()).toBe("2026-07-15T13:00:00.000Z");
    expect(zonedTimeToUtc(2026, 7, 15, 9, "Asia/Kolkata").toISOString()).toBe("2026-07-15T03:30:00.000Z");
  });

  it("moves a time inside a spring-forward gap to just after the gap", () => {
    // 02:00 does not exist in New York on 2026-03-08; clocks jump to 03:00 EDT (07:00Z).
    expect(zonedTimeToUtc(2026, 3, 8, 2, "America/New_York").toISOString()).toBe("2026-03-08T07:00:00.000Z");
  });
});

describe("nextRunAt", () => {
  const daily9 = { frequency: "daily" as const, weekday: null, hour: 9, timezone: "Europe/London" };

  it("runs later today when the hour has not passed, otherwise tomorrow", () => {
    expect(nextRunAt(daily9, at("2026-10-21T07:30:00Z")).toISOString()).toBe("2026-10-21T08:00:00.000Z");
    expect(nextRunAt(daily9, at("2026-10-21T08:00:00Z")).toISOString()).toBe("2026-10-22T08:00:00.000Z");
  });

  it("keeps local 09:00 across the October clock change", () => {
    // London leaves BST on 2026-10-25, so 09:00 local moves from 08:00Z to 09:00Z.
    expect(nextRunAt(daily9, at("2026-10-24T08:00:00Z")).toISOString()).toBe("2026-10-25T09:00:00.000Z");
  });

  it("finds the next matching weekday", () => {
    const mondays = { frequency: "weekly" as const, weekday: 1, hour: 9, timezone: "America/New_York" };
    // 2026-10-21 is a Wednesday.
    expect(nextRunAt(mondays, at("2026-10-21T12:00:00Z")).toISOString()).toBe("2026-10-26T13:00:00.000Z");
    // A Monday after 09:00 local rolls to the following Monday.
    expect(nextRunAt(mondays, at("2026-10-26T14:00:00Z")).toISOString()).toBe("2026-11-02T14:00:00.000Z");
  });

  it("uses the local date, not the UTC date, near midnight", () => {
    const tokyo = { frequency: "daily" as const, weekday: null, hour: 8, timezone: "Asia/Tokyo" };
    // 23:30Z on the 21st is already 08:30 on the 22nd in Tokyo, so the next run is the 23rd.
    expect(nextRunAt(tokyo, at("2026-10-21T23:30:00Z")).toISOString()).toBe("2026-10-22T23:00:00.000Z");
  });
});

describe("schedule helpers", () => {
  it("validates IANA timezones", () => {
    expect(isValidTimezone("Europe/Paris")).toBe(true);
    expect(isValidTimezone("Mars/Olympus")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
  });

  it("describes schedules for people", () => {
    expect(describeSchedule({ frequency: "weekly", weekday: 1, hour: 9, timezone: "UTC" }))
      .toBe("Every Monday at 09:00 (UTC)");
  });
});
