import { NextResponse } from "next/server";
import { listConnections } from "@/lib/shopify/repository";
import { shopifyConfig } from "@/lib/shopify/client";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";

export const runtime = "nodejs";

export async function GET() {
  try {
    const access = await requireWorkspaceAccess("viewer");
    try {
      shopifyConfig();
    } catch (error) {
      const configError =
        error instanceof Error
          ? error.message
          : "Shopify is not configured.";
      return NextResponse.json({
        configured: false,
        connections: [],
        configError,
      });
    }
    if (!process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY) {
      return NextResponse.json({
        configured: false,
        connections: [],
        configError:
          "SHOPIFY_TOKEN_ENCRYPTION_KEY is required to store Shopify tokens.",
      });
    }
    const connections = await listConnections(access.workspaceId);
    return NextResponse.json({ configured: true, connections });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    const message =
      error instanceof Error ? error.message : "Unable to load Shopify stores.";
    return NextResponse.json(
      { configured: false, connections: [], error: message },
      { status: 503 },
    );
  }
}
