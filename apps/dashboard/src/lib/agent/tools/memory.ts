import { z } from "zod";
import { addMemory, MEMORY_LIMIT, MEMORY_MAX_LENGTH } from "../repository";
import { defineTool, ToolInputError } from "../registry";

export const remember = defineTool({
  name: "remember",
  tier: "draft",
  description:
    "Save a short, durable working preference for future conversations in this workspace (e.g. 'Never use emojis in LinkedIn posts'). Use only when the user expresses a lasting preference. Brand facts belong in Brand Brain instead. Never store personal data or secrets.",
  input: z.object({ content: z.string().trim().min(3).max(MEMORY_MAX_LENGTH) }),
  async execute(ctx, { content }) {
    const memory = await addMemory({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      content,
      sourceRunId: ctx.runId ?? null,
    });
    if (!memory) {
      throw new ToolInputError(
        `This workspace already has ${MEMORY_LIMIT} memories. Ask the user to remove some in Settings.`,
      );
    }
    return { saved: true, id: memory.id };
  },
});
