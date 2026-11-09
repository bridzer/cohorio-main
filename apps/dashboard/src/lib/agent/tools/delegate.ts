import { z } from "zod";
import { defineTool, ToolInputError } from "../registry";

/**
 * Delegation is executed by the agent loop itself, not by this execute: the
 * loop offers this tool only when the run was started with a delegate factory
 * (see runWorkspaceAgent), runs a read-only subagent, and folds the subagent's
 * token usage into the parent run. The execute below is a guard for any path
 * that offers the tool without loop support.
 */
export const delegateTaskInput = z.object({
  task: z
    .string()
    .trim()
    .min(10, "Describe the subtask in at least a sentence.")
    .max(3000),
  skill: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .optional()
    .describe("Optional playbook id from the skill catalog for the subagent to load first."),
});

export type DelegateTaskInput = z.infer<typeof delegateTaskInput>;

export const delegateTask = defineTool({
  name: "delegate_task",
  tier: "read",
  description:
    "Delegate a self-contained research or analysis subtask to a subagent and get its findings back. " +
    "The subagent has read-only tools (store, analytics, ad and email reports, web pages, playbooks) and " +
    "none of this conversation, so put every fact it needs into the task. It cannot save drafts, remember " +
    "preferences, send or publish. Use it for an independent investigation you would otherwise do step by " +
    "step yourself; you remain responsible for drafting, saving and proposals.",
  input: delegateTaskInput,
  execute: async () => {
    throw new ToolInputError("Delegation is not available in this run. Do the subtask yourself.");
  },
});
