import { insertCopilotRun } from "@/lib/copilot-repository";
import { completeWithTools, type ToolModel } from "@/lib/llm/client";
import { connectedLabels, connectedTools } from "@/lib/integrations/connectors";
import { listConfiguredProviders } from "@/lib/integrations/store";
import { workspaceContextMarkdown } from "@/lib/marketing-context-prompt";
import { auditAgentEvent } from "./audit";
import { runAgent, type AgentLimits, type AgentRunResult } from "./loop";
import { agentMessages, type HistoryMessage } from "./prompt";
import {
  appendMessage,
  createThread,
  failRun,
  finishRun,
  getThread,
  insertActions,
  listMemories,
  listThreadMessages,
  startRun,
  threadTitle,
  type AgentAction,
} from "./repository";
import { AGENT_TOOLS } from "./tools";
import { skillCatalog } from "./tools/skills";
import type { AgentContext, AgentEvent } from "./types";

export type { AgentRunResult } from "./loop";
export type { AgentContext, AgentEvent, PendingAction, ToolStep } from "./types";

export type TurnEvent = AgentEvent | { type: "thread"; threadId: string; runId: string };

export async function runWorkspaceAgent(input: {
  ctx: AgentContext;
  prompt: string;
  history?: HistoryMessage[];
  memories?: string[];
  workspaceName?: string;
  model?: ToolModel;
  limits?: Partial<AgentLimits>;
  onEvent?: (event: AgentEvent) => void;
}) {
  const [skills, brandMarkdown, providers] = await Promise.all([
    skillCatalog(),
    workspaceContextMarkdown(input.ctx.workspaceId),
    listConfiguredProviders(input.ctx.workspaceId),
  ]);
  return runAgent({
    ctx: input.ctx,
    messages: agentMessages({
      skills,
      brandMarkdown,
      memories: input.memories,
      history: input.history,
      connected: connectedLabels(providers),
      workspaceName: input.workspaceName,
      prompt: input.prompt,
    }),
    tools: [...AGENT_TOOLS, ...connectedTools(providers)],
    model: input.model ?? completeWithTools,
    limits: input.limits,
    onEvent: input.onEvent,
  });
}

export class ThreadNotFoundError extends Error {
  constructor() {
    super("Conversation not found.");
  }
}

export class EmptyAgentOutputError extends Error {
  constructor() {
    super("Cohorio could not finish this request. Try again.");
  }
}

export type AgentTurn = {
  threadId: string;
  runId: string;
  copilotRunId: string;
  createdAt: string;
  result: AgentRunResult;
  actions: AgentAction[];
};

/**
 * One user turn in a thread: loads history and memories, runs the agent,
 * then persists the transcript, run record, pending actions and a Library entry.
 */
export async function runAgentTurn(input: {
  ctx: Omit<AgentContext, "runId">;
  prompt: string;
  threadId?: string;
  workspaceName?: string;
  model?: ToolModel;
  onEvent?: (event: TurnEvent) => void;
}): Promise<AgentTurn> {
  const { workspaceId, userId } = input.ctx;
  let history: HistoryMessage[] = [];
  let threadId: string;
  if (input.threadId) {
    const thread = await getThread(workspaceId, input.threadId);
    if (!thread) throw new ThreadNotFoundError();
    threadId = thread.id;
    history = await listThreadMessages(workspaceId, threadId, 40);
  } else {
    threadId = (await createThread(workspaceId, userId, threadTitle(input.prompt))).id;
  }
  const memories = (await listMemories(workspaceId)).map((memory) => memory.content);
  const runId = await startRun({ workspaceId, threadId, userId, prompt: input.prompt });
  await appendMessage({ workspaceId, threadId, runId, role: "user", content: input.prompt });
  input.onEvent?.({ type: "thread", threadId, runId });

  try {
    const result = await runWorkspaceAgent({
      ctx: { ...input.ctx, runId },
      prompt: input.prompt,
      history,
      memories,
      workspaceName: input.workspaceName,
      model: input.model,
      onEvent: input.onEvent,
    });
    if (!result.output.trim()) throw new EmptyAgentOutputError();
    // Keeps agent answers in the existing Library and Home recent-work lists.
    const copilotRun = await insertCopilotRun({
      workspaceId,
      userId,
      skillId: "agent",
      prompt: input.prompt,
      output: result.output,
    });
    await finishRun(workspaceId, runId, result, copilotRun.id);
    await auditAgentEvent({
      workspaceId,
      actorUserId: userId,
      eventType: "agent.run_completed",
      targetType: "agent_run",
      targetId: runId,
      metadata: {
        threadId,
        stopReason: result.stopReason,
        skills: result.skillsLoaded,
        // Tool names and outcomes only; inputs can hold page text or personal data.
        tools: result.steps.map((step) => ({ tool: step.tool, tier: step.tier, status: step.status })),
        proposedActions: result.pendingActions.map((action) => action.tool),
        tokens: result.usage.promptTokens + result.usage.completionTokens,
      },
    });
    await appendMessage({ workspaceId, threadId, runId, role: "assistant", content: result.output });
    const actions = await insertActions({
      workspaceId,
      threadId,
      runId,
      userId,
      actions: result.pendingActions,
    });
    return {
      threadId,
      runId,
      copilotRunId: copilotRun.id,
      createdAt: copilotRun.created_at,
      result,
      actions,
    };
  } catch (error) {
    await failRun(workspaceId, runId).catch(() => undefined);
    await auditAgentEvent({
      workspaceId,
      actorUserId: userId,
      eventType: "agent.run_failed",
      targetType: "agent_run",
      targetId: runId,
      metadata: { threadId },
    });
    throw error;
  }
}
