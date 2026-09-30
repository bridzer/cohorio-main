import type { NextRequest } from "next/server";

export function clientIp(
  request: NextRequest,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (env.AUTH_TRUST_PROXY !== "true") return "direct";
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const peer = hops.at(-1);
    if (peer) return peer;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("INVALID_ORIGIN");
    }
    return;
  }
  const allowed = new Set(
    [process.env.AUTH_URL, process.env.APP_URL, request.nextUrl.origin]
      .filter(Boolean)
      .map((value) => new URL(value as string).origin),
  );
  if (!allowed.has(new URL(origin).origin)) {
    throw new Error("INVALID_ORIGIN");
  }
}

export function originErrorResponse(error: unknown) {
  if (error instanceof Error && error.message === "INVALID_ORIGIN") {
    return Response.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  }
  return null;
}
