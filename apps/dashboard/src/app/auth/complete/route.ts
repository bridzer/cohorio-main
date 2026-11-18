import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { appBaseUrl } from "@/lib/app-url";
import { ensureUserTenant } from "@/lib/auth/repository";
import { readWorkspaceId, setWorkspaceCookie } from "@/lib/workspace";
import { safeReturnPath } from "@/lib/auth/security";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await auth();
  // Canonical base, not the request host: misbehaving proxies have handed
  // this container `Host: localhost:8080` while serving the public domain.
  const base = appBaseUrl(request.nextUrl.origin);
  if (!session?.user?.id) {
    return NextResponse.redirect(
      new URL(
        `/sign-in?callbackUrl=${encodeURIComponent(request.nextUrl.pathname)}`,
        base,
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
  const response = NextResponse.redirect(new URL(returnTo, base));
  setWorkspaceCookie(response, tenant.workspaceId);
  return response;
}
