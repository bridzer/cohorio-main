import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/access-control", () => ({
  requireWorkspaceAccess: mocks.access, accessErrorResponse: () => null,
}));
vi.mock("@/lib/social/repository", () => ({ updateSocialPost: mocks.update }));
import { PATCH } from "@/app/api/social/posts/[id]/route";

const id = "11111111-1111-4111-8111-111111111111";
function patch(body: unknown, origin = "https://cohorio.test") {
  return PATCH(new NextRequest(`https://cohorio.test/api/social/posts/${id}`, {
    method: "PATCH", headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("DATABASE_URL", "postgresql://unused-test-host/cohorio");
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2030-10-20T00:00:00Z"));
  mocks.access.mockResolvedValue({ workspaceId: "authorized-workspace" });
  mocks.update.mockResolvedValue({ id, status: "scheduled" });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("schedule update route", () => {
  it("persists the chosen instant with workspace scope and accepts rescheduling", async () => {
    for (const [input, expected] of [
      ["2030-10-25T14:35:00+03:00", "2030-10-25T11:35:00.000Z"],
      ["2030-10-26T16:00:00Z", "2030-10-26T16:00:00.000Z"],
    ]) {
      expect((await patch({ status: "scheduled", scheduledFor: input })).status).toBe(200);
      expect(mocks.update).toHaveBeenLastCalledWith("authorized-workspace", id, {
        status: "scheduled", scheduledFor: expected,
      });
    }
    expect(mocks.access).toHaveBeenCalledWith("member");
  });

  it.each([
    undefined, "", "tomorrow", "2030-02-30T10:00:00Z",
    "2030-10-25T14:35:00", "2030-10-19T00:00:00Z", "2030-10-20T00:00:00Z",
  ])("rejects invalid, ambiguous or past dates without updating: %s", async (scheduledFor) => {
    expect((await patch({ status: "scheduled", scheduledFor })).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("can return a post to draft and clear its schedule", async () => {
    expect((await patch({ status: "draft" })).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith("authorized-workspace", id, {
      status: "draft", scheduledFor: null,
    });
  });

  it("saves edited copy alongside the chosen schedule", async () => {
    expect((await patch({
      status: "scheduled", scheduledFor: "2030-10-25T14:35:00Z", body: " Updated copy ",
    })).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith("authorized-workspace", id, {
      status: "scheduled", scheduledFor: "2030-10-25T14:35:00.000Z", body: "Updated copy",
    });
  });

  it("rejects empty edited copy without changing the saved post", async () => {
    expect((await patch({
      status: "scheduled", scheduledFor: "2030-10-25T14:35:00Z", body: " ",
    })).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("does not update another workspace's nonexistent post", async () => {
    mocks.update.mockResolvedValue(null);
    expect((await patch({ status: "draft" })).status).toBe(404);
  });

  it("rejects cross-origin writes before accessing workspace data", async () => {
    expect((await patch({ status: "draft" }, "https://other.test")).status).toBe(403);
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
