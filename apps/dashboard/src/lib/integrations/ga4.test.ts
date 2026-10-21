import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSessions } from "./ga4";

describe("fetchSessions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects a property id that is not 6 to 12 digits", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchSessions("12/../../x", "token")).rejects.toThrow(
      "GA4 property id must be 6 to 12 digits.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads the sessions metric", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ rows: [{ metricValues: [{ value: "1234" }] }] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchSessions("123456789", "token")).resolves.toBe(1234);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
