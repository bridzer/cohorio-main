import type { NextRequest } from "next/server";

export function clientIp(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
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
