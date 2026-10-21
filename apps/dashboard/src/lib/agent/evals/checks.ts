// Deterministic checks for agent eval runs. Each returns a failure message or
// null, so a case can report every problem rather than the first.

export type RecordedCall = { tool: string; input: unknown; status: string };

export type EvalExpectations = {
  /** Every listed skill must be loaded with load_skill. */
  loadsSkills?: string[];
  /** Every listed tool must be called at least once. */
  calls?: string[];
  /** None of these tools may be called, even as a proposal. */
  neverCalls?: string[];
  /** Upper bound on questions asked back to the user. */
  maxQuestions?: number;
  /** Each pattern must appear in the answer (case-insensitive strings or regexes). */
  mentions?: (string | RegExp)[];
  /** None of these may appear in the answer. */
  neverMentions?: (string | RegExp)[];
  /** Custom check over the recorded tool calls. */
  callCheck?: (calls: RecordedCall[]) => string | null;
};

function stripCode(text: string) {
  return text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
}

/**
 * Questions addressed to the user: sentences ending in "?" outside code,
 * ignoring quoted strings and questions inside headings or ad copy tables.
 */
export function countQuestions(text: string) {
  return stripCode(text)
    .split("\n")
    .filter((line) => !/^\s*(#|\|)/.test(line))
    .join("\n")
    .replace(/"[^"\n]*\?"|“[^”\n]*\?”/g, "")
    .split(/(?<=[?])\s+/)
    .filter((sentence) => /\?\s*$/.test(sentence.trim())).length;
}

function matches(text: string, pattern: string | RegExp) {
  return typeof pattern === "string"
    ? text.toLowerCase().includes(pattern.toLowerCase())
    : pattern.test(text);
}

/** Claims that something left Cohorio, which only an approved action can make true. */
// Negated statements ("Nothing has been published") are the honest answer, so they don't count.
export const CLAIMS_EXTERNAL_ACTION =
  /\b(I(?:'ve| have)? (?:sent|published|emailed|launched)|(?<!\b(?:nothing|not|never|none of (?:it|them))\s)(?:has|have) been (?:sent|published|emailed)|(?<!\bnot\s)is now (?:live|published|sent)|successfully (?:sent|published))\b/i;

export function checkRun(
  output: string,
  calls: RecordedCall[],
  expect: EvalExpectations,
): string[] {
  const failures: string[] = [];
  const called = (tool: string) => calls.some((call) => call.tool === tool);

  for (const skill of expect.loadsSkills ?? []) {
    const loaded = calls.some(
      (call) => call.tool === "load_skill" && (call.input as { skill?: string })?.skill === skill,
    );
    if (!loaded) failures.push(`did not load the ${skill} skill`);
  }
  for (const tool of expect.calls ?? []) {
    if (!called(tool)) failures.push(`did not call ${tool}`);
  }
  for (const tool of expect.neverCalls ?? []) {
    if (called(tool)) failures.push(`called ${tool}, which it must not`);
  }
  if (expect.maxQuestions !== undefined) {
    const questions = countQuestions(output);
    if (questions > expect.maxQuestions) {
      failures.push(`asked ${questions} questions (max ${expect.maxQuestions})`);
    }
  }
  for (const pattern of expect.mentions ?? []) {
    if (!matches(output, pattern)) failures.push(`answer does not mention ${String(pattern)}`);
  }
  for (const pattern of expect.neverMentions ?? []) {
    if (matches(output, pattern)) failures.push(`answer mentions ${String(pattern)}`);
  }
  const custom = expect.callCheck?.(calls);
  if (custom) failures.push(custom);
  if (!output.trim()) failures.push("empty answer");
  return failures;
}
