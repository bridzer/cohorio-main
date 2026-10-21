import { NextRequest, NextResponse } from "next/server";
import {
  automationInput,
  AutomationLimitError,
  createAutomation,
  listAutomations,
  validationMessage,
} from "@/lib/agent/automations";
import { auditAgentEvent } from "@/lib/agent/audit";
import { workerOnline } from "@/lib/agent/jobs";
import { notificationsConfigured } from "@/lib/agent/notify";
import {
  accessErrorResponse,
  requireWorkspaceAccess,
} from "@/lib/access-control";
import {
  assertSameOrigin,
  originErrorResponse,
} from "@/lib/auth/request";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { workspaceId } = await requireWorkspaceAccess("viewer");
    const [automations, online] = await Promise.all([
      listAutomations(workspaceId),
      workerOnline(),
    ]);
    return NextResponse.json({
      automations,
      workerOnline: online,
      emailConfigured: notificationsConfigured(),
    });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return NextResponse.json({ error: "Unable to load automations." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const access = await requireWorkspaceAccess("member");
    const parsed = automationInput.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
    }
    const automation = await createAutomation(access.workspaceId, access.userId, parsed.data);
    await auditAgentEvent({
      workspaceId: access.workspaceId,
      actorUserId: access.userId,
      eventType: "agent.automation_created",
      targetType: "automation",
      targetId: automation.id,
      metadata: { name: automation.name, schedule: automation.scheduleLabel },
    });
    return NextResponse.json({ automation }, { status: 201 });
  } catch (error) {
    const originResponse = originErrorResponse(error);
    if (originResponse) return originResponse;
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    if (error instanceof AutomationLimitError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Create automation failed", error);
    return NextResponse.json({ error: "Unable to save this automation." }, { status: 503 });
  }
}
