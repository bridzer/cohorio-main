import type { AgentContext, AgentTool } from "@/lib/agent/types";
import { ToolInputError } from "@/lib/agent/registry";
import { loadIntegration } from "@/lib/integrations/store";

/**
 * A provider Cohorio can actually talk to: it can check a credential before
 * saving it and exposes agent tools. Providers without a connector can still
 * store a key, but nothing uses or verifies it.
 */
export type Connector<Credential> = {
  provider: string;
  label: string;
  /** Shown as the input placeholder in Settings. Never includes real values. */
  keyHint: string;
  /** Throws RangeError with a user-safe message when the format is wrong. */
  parse: (plaintext: string) => Credential;
  /** Makes one cheap read-only call; throws ProviderError when it fails. */
  verify: (credential: Credential, signal?: AbortSignal) => Promise<void>;
  tools: AgentTool[];
};

export function parseJsonCredential(plaintext: string, label: string) {
  try {
    const value = JSON.parse(plaintext) as unknown;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // Fall through to the format error.
  }
  throw new RangeError(`${label} credentials must be a JSON object. See the placeholder for the format.`);
}

export function requiredString(value: unknown, field: string, label: string) {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!text) throw new RangeError(`${label} credentials are missing ${field}.`);
  return text;
}

/** Loads and parses the workspace's saved credential inside a tool call. */
export async function credentialFor<Credential>(
  ctx: AgentContext,
  connector: Pick<Connector<Credential>, "provider" | "label" | "parse">,
) {
  const plaintext = await loadIntegration(ctx.workspaceId, connector.provider);
  if (!plaintext) {
    throw new ToolInputError(`${connector.label} is not connected. Connect it in Settings → Marketing tools.`);
  }
  try {
    return connector.parse(plaintext);
  } catch (error) {
    throw new ToolInputError(
      error instanceof RangeError ? error.message : `${connector.label} credentials could not be read.`,
    );
  }
}
