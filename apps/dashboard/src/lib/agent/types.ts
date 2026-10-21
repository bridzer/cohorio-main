import type { z } from "zod";
import type { OrganizationRole } from "@/lib/auth/roles";

/**
 * read: inspects workspace or public data. Runs automatically.
 * draft: writes rows inside Cohorio only. Runs automatically for members.
 * external: reaches outside Cohorio (send, publish) or changes Brand Brain.
 *   Never executed by the loop; it becomes a pending action for a human.
 */
export type RiskTier = "read" | "draft" | "external";

/** Built from the authenticated session. The model can never supply these. */
export type AgentContext = {
  workspaceId: string;
  userId: string;
  role: OrganizationRole;
  runId?: string;
  signal?: AbortSignal;
};

type ToolBase<Input> = {
  name: string;
  description: string;
  input: z.ZodType<Input>;
  /**
   * The result carries third-party text (web pages, search snippets, product
   * copy). It is labelled as untrusted data before the model sees it.
   */
  untrusted?: boolean;
};

export type ExecutableTool<Input = unknown> = ToolBase<Input> & {
  tier: "read" | "draft";
  execute: (ctx: AgentContext, input: Input) => Promise<unknown>;
};

/** External tools have no execute: the loop cannot run them, only propose them. */
export type ExternalTool<Input = unknown> = ToolBase<Input> & {
  tier: "external";
  summarize: (input: Input) => string;
};

export type AgentTool<Input = unknown> = ExecutableTool<Input> | ExternalTool<Input>;

export type PendingAction = {
  tool: string;
  input: unknown;
  summary: string;
};

export type ToolStep = {
  tool: string;
  tier: RiskTier | "unknown";
  input: unknown;
  status: "ok" | "error" | "approval_required";
  preview: string;
  durationMs: number;
  /** In-app path where a draft tool saved its output, e.g. /social. */
  link?: string;
};

/** Progress emitted while a run executes, for streaming to the UI. */
export type AgentEvent =
  | { type: "tool_start"; tool: string; tier: ToolStep["tier"] }
  | { type: "tool_end"; step: ToolStep };
