import { NextResponse } from "next/server";
import { fetchSessions } from "@/lib/integrations/ga4";
import { loadGa4Settings } from "@/lib/integrations/store";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";

export const runtime = "nodejs";

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "DATABASE_URL is required to load GA4." },
      { status: 503 },
    );
  }
  try {
    const workspaceId = (await requireWorkspaceAccess("viewer")).workspaceId;
    const settings = await loadGa4Settings(workspaceId);
    if (!settings?.propertyId) {
      return NextResponse.json({ configured: false });
    }
    const sessions = await fetchSessions(
      settings.propertyId,
      settings.accessToken,
    );
    return NextResponse.json({
      configured: true,
      sessions,
      range: "Last 28 days",
    });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    const message =
      error instanceof Error && error.message.startsWith("GA4")
        ? error.message
        : "Unable to load GA4 sessions.";
    return NextResponse.json({ configured: true, error: message }, { status: 502 });
  }
}
