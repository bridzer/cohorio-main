import type { AgentTool } from "@/lib/agent/types";
import { connector as dataforseo } from "./dataforseo";
import { connector as klaviyo } from "./klaviyo";
import { connector as metaAds } from "./meta-ads";
import { connector as plausible } from "./plausible";
import type { Connector } from "./types";

export const CONNECTORS: Record<string, Connector<unknown>> = Object.fromEntries(
  [metaAds, klaviyo, plausible, dataforseo].map((connector) => [
    connector.provider,
    connector as Connector<unknown>,
  ]),
);

export function connectorFor(provider: string) {
  return CONNECTORS[provider] ?? null;
}

/** Tools for the providers this workspace has connected; others are never offered. */
export function connectedTools(configuredProviders: Iterable<string>): AgentTool[] {
  return [...configuredProviders].flatMap((provider) => CONNECTORS[provider]?.tools ?? []);
}

export function connectedLabels(configuredProviders: Iterable<string>) {
  return [...configuredProviders]
    .map((provider) => CONNECTORS[provider]?.label)
    .filter((label): label is string => Boolean(label));
}
