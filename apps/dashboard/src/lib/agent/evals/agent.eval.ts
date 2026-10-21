import { writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { EVAL_CASES } from "./cases";
import { runEvalCase, type CaseResult } from "./run";

// Live evals: real model, real playbooks, fixture data. Run with `npm run eval`.
// EVAL_CASE=<id> runs one case; EVAL_REPEATS=<n> repeats each case to expose flakiness.

const selected = process.env.EVAL_CASE
  ? EVAL_CASES.filter((evalCase) => evalCase.id === process.env.EVAL_CASE)
  : EVAL_CASES;
const repeats = Math.max(1, Math.min(10, Number(process.env.EVAL_REPEATS) || 1));
const results: CaseResult[] = [];
const hasKey = Boolean(process.env.COHORIO_LLM_API_KEY?.trim());

describe.skipIf(!hasKey)(`agent evals (${process.env.COHORIO_LLM_MODEL ?? "default model"})`, () => {
  for (const evalCase of selected) {
    for (let attempt = 1; attempt <= repeats; attempt += 1) {
      it(`${evalCase.id}${repeats > 1 ? ` #${attempt}` : ""}`, async () => {
        const result = await runEvalCase(evalCase);
        results.push(result);
        expect(result.failures, `${evalCase.why}\n\nAnswer:\n${result.output.slice(0, 1500)}`).toEqual([]);
      });
    }
  }

  afterAll(() => {
    const passed = results.filter((result) => result.passed).length;
    const tokens = results.reduce((sum, result) => sum + result.usage.promptTokens + result.usage.completionTokens, 0);
    const report = {
      model: process.env.COHORIO_LLM_MODEL ?? null,
      ranAt: new Date().toISOString(),
      passed,
      total: results.length,
      tokens,
      results,
    };
    writeFileSync(path.join(process.cwd(), "eval-report.json"), `${JSON.stringify(report, null, 2)}\n`);
    console.info(
      [
        "",
        `Agent evals: ${passed}/${results.length} passed · ${tokens.toLocaleString()} tokens · report: eval-report.json`,
        ...results.map((result) =>
          `${result.passed ? "PASS" : "FAIL"}  ${result.id}${result.judge ? `  judge ${result.judge.score}/5` : ""}  ${(result.durationMs / 1000).toFixed(1)}s${
            result.failures.length ? `\n      - ${result.failures.join("\n      - ")}` : ""
          }`,
        ),
      ].join("\n"),
    );
  });
});
