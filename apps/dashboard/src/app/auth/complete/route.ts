import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureUserTenant } from "@/lib/auth/repository";
import { readWorkspaceId, setWorkspaceCookie } from "@/lib/workspace";
import { safeReturnPath } from "@/lib/auth/security";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(
      new URL(
        `/sign-in?callbackUrl=${encodeURIComponent(request.nextUrl.pathname)}`,
        request.nextUrl.origin,
      ),
    );
  }
  const tenant = await ensureUserTenant(
    session.user.id,
    await readWorkspaceId(),
  );
  const returnTo = safeReturnPath(
    request.nextUrl.searchParams.get("returnTo"),
    "/",
  );
  const response = NextResponse.redirect(new URL(returnTo, request.nextUrl.origin));
  setWorkspaceCookie(response, tenant.workspaceId);
  return response;
}
