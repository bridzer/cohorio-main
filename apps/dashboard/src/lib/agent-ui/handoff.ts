/** Pages hand a prompt to /agent through this sessionStorage key, never the URL. */
export const PENDING_PROMPT_KEY = "cohorio-agent-prompt";

/**
 * /api/agent/runs rejects prompts over 8,000 characters, so the embedded
 * report is capped first and the whole handoff hard-capped below the limit.
 */
const HANDOFF_REPORT_LIMIT = 6_000;
const HANDOFF_PROMPT_LIMIT = 7_900;
/** Long form answers are summarized so the report keeps most of the budget. */
const HANDOFF_INPUT_LIMIT = 500;

export type AuditHandoffInput = {
  workspaceName: string;
  jobLabel: string;
  /** The answers the user gave on the workspace form, in display order. */
  inputs: { label: string; value: string }[];
  /** The finished audit report. */
  report: string;
};

/**
 * Builds the first message of the new agent conversation that opens when an
 * audit runs: what was audited, what the user asked for, and the report
 * itself, so the discussion and implementation continue in chat.
 */
export function buildAuditHandoffPrompt(input: AuditHandoffInput) {
  const inputs = input.inputs.map((item) => {
    const value = item.value.trim();
    const shown =
      value.length > HANDOFF_INPUT_LIMIT
        ? `${value.slice(0, HANDOFF_INPUT_LIMIT).trimEnd()}…`
        : value;
    return `${item.label}: ${shown}`;
  });
  const header = [
    "I just ran an audit and want to continue with it here.",
    "",
    `Workspace: ${input.workspaceName}`,
    `Request: ${input.jobLabel}`,
    ...inputs,
    "",
    "## Audit report",
  ].join("\n");
  let report = input.report.trim();
  let note = "";
  if (report.length > HANDOFF_REPORT_LIMIT) {
    report = report.slice(0, HANDOFF_REPORT_LIMIT).trimEnd();
    note = "\n\n…[report truncated to fit the chat message limit]";
  }
  const closing = [
    "",
    "Please confirm the top 3 priorities from this report, then help me implement the fixes one by one. Ask me for anything you need before changing anything.",
  ].join("\n");
  let prompt = `${header}\n${report}${note}${closing}`;
  if (prompt.length > HANDOFF_PROMPT_LIMIT) {
    prompt = `${prompt.slice(0, HANDOFF_PROMPT_LIMIT).trimEnd()}…`;
  }
  return prompt;
}
