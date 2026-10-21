import { CONNECTORS } from "@/lib/integrations/connectors";
import { AGENT_TOOLS } from "../tools";
import type { AgentTool } from "../types";

/** A canned tool result, or a function of the tool input. */
export type ToolFixture = unknown | ((input: unknown) => unknown);

// Playbooks are read from disk for real so evals exercise the actual skills.
const REAL_TOOLS = new Set(["load_skill", "read_skill_reference"]);

function defaultResult(tool: AgentTool, input: unknown) {
  if (tool.tier === "draft") {
    return { saved: true, id: "00000000-0000-4000-8000-000000000001", input };
  }
  return { note: "No data is available for this in the current workspace." };
}

/**
 * The real tool definitions (names, descriptions, schemas and tiers) with
 * data and write tools answered from fixtures, so an eval never touches a
 * database or provider. External tools stay external: the registry turns
 * them into proposals without ever calling anything.
 */
export function fixtureTools(
  fixtures: Record<string, ToolFixture>,
  connectedProviders: string[] = [],
): AgentTool[] {
  const tools = [
    ...AGENT_TOOLS,
    ...connectedProviders.flatMap((provider) => CONNECTORS[provider]?.tools ?? []),
  ];
  return tools.map((tool): AgentTool => {
    if (tool.tier === "external" || REAL_TOOLS.has(tool.name)) return tool;
    return {
      ...tool,
      async execute(_ctx, input) {
        const fixture = fixtures[tool.name];
        if (fixture === undefined) return defaultResult(tool, input);
        return typeof fixture === "function" ? (fixture as (value: unknown) => unknown)(input) : fixture;
      },
    };
  });
}
