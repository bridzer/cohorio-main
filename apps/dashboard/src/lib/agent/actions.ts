import { z } from "zod";
import { AdNetworkError, PublishConfigError } from "@/lib/ads/publish";
import {
  CampaignNotFoundError,
  publishWorkspaceCampaign,
} from "@/lib/ads/publish-campaign";
import { LifecycleSendError, sendLifecycleDraft } from "@/lib/lifecycle-send";
import type { ContextSectionId } from "@/lib/marketing-context";
import {
  getMarketingContext,
  saveMarketingContextSection,
} from "@/lib/marketing-context-repository";
import { auditAgentEvent } from "./audit";
import {
  appendMessage,
  claimAction,
  completeAction,
  type AgentAction,
} from "./repository";
import {
  proposeBrandBrainUpdate,
  publishAdCampaign,
  sendLifecycleEmail,
} from "./tools/external";
import type { AgentTool } from "./types";

type Executor = {
  tool: AgentTool;
  run: (workspaceId: string, input: never) => Promise<unknown>;
};

function executor<Input>(
  tool: AgentTool,
  run: (workspaceId: string, input: Input) => Promise<unknown>,
): Executor {
  return { tool, run: run as Executor["run"] };
}

export const ACTION_EXECUTORS: Record<string, Executor> = {
  send_lifecycle_email: executor<{ draftId: string; to: string }>(
    sendLifecycleEmail,
    async (workspaceId, { draftId, to }) => {
      const draft = await sendLifecycleDraft(workspaceId, draftId, to);
      return { draftId, status: draft?.status ?? "sent", sentAt: draft?.sentAt ?? null };
    },
  ),
  publish_ad_campaign: executor<{ connectionId: string; campaignId: string }>(
    publishAdCampaign,
    async (workspaceId, { connectionId, campaignId }) => {
      const campaign = await publishWorkspaceCampaign(workspaceId, connectionId, campaignId);
      return { campaignId, status: campaign?.status ?? "ready" };
    },
  ),
  propose_brand_brain_update: executor<{
    section: ContextSectionId;
    values: Record<string, string>;
  }>(proposeBrandBrainUpdate, async (workspaceId, { section, values }) => {
    // Section saves replace the whole section object, so merge with what is stored.
    const stored = await getMarketingContext(workspaceId);
    const current = stored?.sections?.[section] ?? {};
    const { _notApplicable: _dropped, ...kept } = current;
    void _dropped;
    await saveMarketingContextSection(workspaceId, section, { ...kept, ...values });
    return { section, updatedFields: Object.keys(values) };
  }),
};

/** Error text that is safe to store and show; everything else is generic. */
function actionErrorMessage(error: unknown) {
  if (
    error instanceof LifecycleSendError ||
    error instanceof PublishConfigError ||
    error instanceof AdNetworkError ||
    error instanceof CampaignNotFoundError
  ) {
    return error.message;
  }
  if (error instanceof z.ZodError) return "The proposed action is no longer valid.";
  return "The action failed. Nothing was confirmed by the provider.";
}

export type ActionDecisionResult =
  | { ok: true; action: AgentAction }
  | { ok: false; reason: "not_pending" };

export async function decideAction(input: {
  workspaceId: string;
  userId: string;
  actionId: string;
  decision: "approve" | "reject";
}): Promise<ActionDecisionResult> {
  const claimed = await claimAction(
    input.workspaceId,
    input.actionId,
    input.userId,
    input.decision === "approve" ? "approved" : "rejected",
  );
  if (!claimed) return { ok: false, reason: "not_pending" };
  const audit = (eventType: Parameters<typeof auditAgentEvent>[0]["eventType"], metadata: Record<string, unknown> = {}) =>
    auditAgentEvent({
      workspaceId: input.workspaceId,
      actorUserId: input.userId,
      eventType,
      targetType: "agent_action",
      targetId: claimed.id,
      metadata: { tool: claimed.tool, summary: claimed.summary, threadId: claimed.threadId, ...metadata },
    });
  await audit(input.decision === "approve" ? "agent.action_approved" : "agent.action_rejected");

  const note = (content: string) =>
    appendMessage({
      workspaceId: input.workspaceId,
      threadId: claimed.threadId,
      runId: claimed.runId,
      role: "event",
      content,
    });

  if (input.decision === "reject") {
    await note(`Rejected by user: ${claimed.summary}. It was not executed.`);
    return { ok: true, action: claimed };
  }

  let outcome: Parameters<typeof completeAction>[2];
  const entry = ACTION_EXECUTORS[claimed.tool];
  try {
    if (!entry) throw new Error(`No executor for ${claimed.tool}.`);
    const parsed = entry.tool.input.parse(claimed.input);
    outcome = { status: "executed", result: await entry.run(input.workspaceId, parsed as never) };
  } catch (error) {
    if (!(error instanceof LifecycleSendError) && !(error instanceof PublishConfigError)) {
      console.error(`Agent action ${claimed.tool} failed`, error);
    }
    outcome = { status: "failed", error: actionErrorMessage(error) };
  }
  const completed = (await completeAction(input.workspaceId, claimed.id, outcome)) ?? claimed;
  await audit(
    outcome.status === "executed" ? "agent.action_executed" : "agent.action_failed",
    outcome.status === "failed" ? { error: outcome.error } : {},
  );
  await note(
    outcome.status === "executed"
      ? `Approved and executed: ${claimed.summary}.`
      : `Approved but failed: ${claimed.summary}. ${outcome.error}`,
  );
  return { ok: true, action: completed };
}
