import { describe, expect, it } from "vitest";
import { localScheduleToIso, scheduleDay } from "./schedule";

describe("social schedule dates", () => {
  it("converts the selected browser-local time to an instant without replacing it", () => {
    const expected = new Date(2030, 9, 25, 14, 35);
    expect(localScheduleToIso("2030-10-25T14:35", 0)).toBe(expected.toISOString());
  });

  it.each(["", "tomorrow", "2030-02-30T10:00", "2030-10-25T25:00"])(
    "rejects missing or invalid local dates: %s", (value) => {
      expect(() => localScheduleToIso(value, 0)).toThrow();
    },
  );

  it("rejects the current time and past times", () => {
    const selected = new Date(2030, 9, 25, 14, 35).getTime();
    expect(() => localScheduleToIso("2030-10-25T14:35", selected)).toThrow("future");
    expect(() => localScheduleToIso("2030-10-25T14:35", selected + 1)).toThrow("future");
  });

  it("groups the same instant by the viewer's timezone across midnight", () => {
    const iso = "2030-10-25T22:30:00.000Z";
    expect(scheduleDay(iso, "UTC")).toBe("2030-10-25");
    expect(scheduleDay(iso, "Africa/Nairobi")).toBe("2030-10-26");
    expect(scheduleDay(iso, "America/New_York")).toBe("2030-10-25");
  });
});
