import { NextRequest, NextResponse } from "next/server";

// TEMPORARY login-redirect diagnostic. Reports only hostnames and whether URL
// vars are set — never secrets, tokens, or full URLs. Delete after debugging.
export const runtime = "nodejs";

function hostOf(value: string | undefined) {
  if (value === undefined) return "unset";
  try {
    return new URL(value).host;
  } catch {
    return "invalid-url";
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    hostHeader: request.headers.get("host"),
    xForwardedHost: request.headers.get("x-forwarded-host"),
    xForwardedProto: request.headers.get("x-forwarded-proto"),
    nextUrlOrigin: request.nextUrl.origin,
    nodeEnv: process.env.NODE_ENV,
    authUrlHost: hostOf(process.env.AUTH_URL),
    appUrlHost: hostOf(process.env.APP_URL),
  });
}
