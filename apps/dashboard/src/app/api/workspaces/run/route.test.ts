import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  context: vi.fn(),
  complete: vi.fn(),
  insert: vi.fn(),
  quota: vi.fn(),
  record: vi.fn(),
}));

vi.mock("@/lib/access-control", () => ({
  requireWorkspaceAccess: mocks.access,
  accessErrorResponse: () => null,
}));
vi.mock("@/lib/marketing-context-repository", () => ({
  getMarketingContext: mocks.context,
}));
vi.mock("@/lib/llm/client", () => ({ completeChat: mocks.complete }));
vi.mock("@/lib/copilot-repository", () => ({
  insertCopilotRun: mocks.insert,
  listCopilotRuns: vi.fn(),
}));
vi.mock("@/lib/billing/quota", () => ({
  assertTaskQuota: mocks.quota,
  recordTaskEvent: mocks.record,
  quotaErrorResponse: () => null,
}));

import { POST } from "./route";

const auditBody = {
  workspaceId: "seo",
  jobId: "audit",
  answers: {
    surface: "https://example.com",
    goal: "Convert from search",
    situation: "Thin product copy",
  },
};

const creativeBody = {
  workspaceId: "paid",
  jobId: "creative",
  answers: { offer: "Ceramic mugs", goal: "Purchases" },
};

function request(body: unknown) {
  return new NextRequest("https://cohorio.test/api/workspaces/run", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://cohorio.test" },
    body: JSON.stringify(body),
  });
}

async function post(body: unknown) {
  const response = await POST(request(body));
  return { status: response.status, payload: (await response.json()) as Record<string, unknown> };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("DATABASE_URL", "postgresql://unused-test-host/cohorio");
  vi.stubEnv("COHORIO_LLM_API_KEY", "test-only-never-sent");
  mocks.access.mockResolvedValue({ workspaceId: "workspace-a", userId: "user-a" });
  mocks.context.mockResolvedValue(null);
  mocks.complete.mockResolvedValue("## Findings\n1. Fix titles.");
  mocks.insert.mockResolvedValue({
    id: "run-a",
    output: "## Findings\n1. Fix titles.",
    created_at: "2026-11-14T00:00:00.000Z",
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("workspace audit handoff", () => {
  it("returns a chat handoff seeded with the audit request and report", async () => {
    const { status, payload } = await post(auditBody);
    expect(status).toBe(201);
    expect(typeof payload.handoff).toBe("string");
    const handoff = payload.handoff as string;
    expect(handoff).toContain("Request: Audit a site or page");
    expect(handoff).toContain("https://example.com");
    expect(handoff).toContain("## Findings");
    expect(handoff.length).toBeLessThanOrEqual(7_900);
  });

  it("returns no handoff for non-audit jobs", async () => {
    const { status, payload } = await post(creativeBody);
    expect(status).toBe(201);
    expect(payload.handoff).toBeNull();
  });
});
