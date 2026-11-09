import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();

vi.mock("@/lib/database", () => ({
  query: (...args: unknown[]) => query(...args),
}));

import { deleteThread, renameThread, updateMemory } from "./repository";

const now = new Date("2026-11-09T00:00:00.000Z");

beforeEach(() => {
  query.mockReset();
});

describe("renameThread", () => {
  it("renames only within the caller's workspace", async () => {
    query.mockResolvedValue({
      rows: [{ id: "t1", title: "New title", created_at: now, updated_at: now }],
    });
    await expect(renameThread("ws-1", "t1", "New title")).resolves.toEqual({
      id: "t1",
      title: "New title",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("workspace_id = $2");
    expect(params).toEqual(["t1", "ws-1", "New title"]);
  });

  it("returns null when the thread is not in the workspace", async () => {
    query.mockResolvedValue({ rows: [] });
    await expect(renameThread("ws-1", "missing", "X")).resolves.toBeNull();
  });
});

describe("deleteThread", () => {
  it("deletes scoped to the workspace and reports the match", async () => {
    query.mockResolvedValue({ rowCount: 1 });
    await expect(deleteThread("ws-1", "t1")).resolves.toBe(true);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("workspace_id = $2");
    expect(params).toEqual(["t1", "ws-1"]);
  });

  it("returns false when nothing matched", async () => {
    query.mockResolvedValue({ rowCount: 0 });
    await expect(deleteThread("ws-1", "missing")).resolves.toBe(false);
  });
});

describe("updateMemory", () => {
  it("updates content scoped to the workspace", async () => {
    query.mockResolvedValue({
      rows: [{ id: "m1", content: "No emojis", created_at: now }],
    });
    await expect(updateMemory("ws-1", "m1", "No emojis")).resolves.toEqual({
      id: "m1",
      content: "No emojis",
      createdAt: now.toISOString(),
    });
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("workspace_id = $2");
    expect(params).toEqual(["m1", "ws-1", "No emojis"]);
  });

  it("returns null when the memory is not in the workspace", async () => {
    query.mockResolvedValue({ rows: [] });
    await expect(updateMemory("ws-1", "missing", "X")).resolves.toBeNull();
  });
});
