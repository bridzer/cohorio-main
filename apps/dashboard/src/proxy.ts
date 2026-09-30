import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

const PUBLIC_PATHS = [
  "/sign-in",
  "/login",
  "/register",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
  "/invite",
  "/auth/complete",
  "/api/auth",
  "/api/shopify/oauth/callback",
];

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  const session = await auth();
  if (session?.user?.id) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  const signIn = new URL("/sign-in", request.url);
  signIn.searchParams.set(
    "callbackUrl",
    `${pathname}${request.nextUrl.search}`,
  );
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
