import { NextResponse } from "next/server";
import { listConnections } from "@/lib/shopify/repository";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";

export const runtime = "nodejs";

export async function GET() {
  const configured = Boolean(
    process.env.DATABASE_URL &&
      process.env.SHOPIFY_CLIENT_ID &&
      process.env.SHOPIFY_CLIENT_SECRET &&
      process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY &&
      process.env.APP_URL,
  );

  try {
    const access = await requireWorkspaceAccess("viewer");
    const connections = configured
      ? await listConnections(access.workspaceId)
      : [];
    return NextResponse.json({ configured, connections });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    const message =
      error instanceof Error ? error.message : "Unable to load Shopify stores.";
    return NextResponse.json(
      { configured, connections: [], error: message },
      { status: 503 },
    );
  }
}
