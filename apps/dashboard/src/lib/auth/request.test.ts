import { describe, expect, it } from "vitest";
import { originErrorResponse } from "./request";

describe("same-origin errors", () => {
  it("returns 403 for INVALID_ORIGIN", async () => {
    const response = originErrorResponse(new Error("INVALID_ORIGIN"));
    expect(response).not.toBeNull();
    expect(response?.status).toBe(403);
    await expect(response!.json()).resolves.toEqual({
      error: "Invalid request origin.",
    });
  });

  it("ignores unrelated errors", () => {
    expect(originErrorResponse(new Error("UNAUTHORIZED"))).toBeNull();
  });
});
