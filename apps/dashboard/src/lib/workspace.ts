import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { query } from "@/lib/database";

const WORKSPACE_COOKIE = "cohorio_workspace";
const ONE_YEAR = 60 * 60 * 24 * 365;

export async function readWorkspaceId() {
  const value = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

export function createWorkspaceId() {
  return randomUUID();
}

export function setWorkspaceCookie(
  response: NextResponse,
  workspaceId: string,
) {
  response.cookies.set(WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR,
  });
}

export function clearWorkspaceCookie(response: NextResponse) {
  response.cookies.set(WORKSPACE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function ensureAnonymousWorkspace(workspaceId: string) {
  await query(
    `INSERT INTO workspaces (id, name, slug, status)
     VALUES ($1, 'Anonymous workspace', CONCAT('anonymous-', LEFT($1::text, 8)), 'anonymous')
     ON CONFLICT (id) DO NOTHING`,
    [workspaceId],
  );
  return workspaceId;
}

export async function requireWorkspaceId() {
  const workspaceId = await readWorkspaceId();
  if (!workspaceId) {
    throw new Error("WORKSPACE_REQUIRED");
  }
  return workspaceId;
}
