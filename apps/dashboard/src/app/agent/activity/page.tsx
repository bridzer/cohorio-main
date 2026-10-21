"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AuditEntry } from "@/lib/agent/audit";
import { toolLabel } from "@/lib/agent-ui/labels";
import "../agent.css";

const EVENT_LABEL: Record<string, string> = {
  "agent.run_completed": "Agent run",
  "agent.run_failed": "Agent run failed",
  "agent.action_approved": "Action approved",
  "agent.action_rejected": "Action rejected",
  "agent.action_executed": "Action executed",
  "agent.action_failed": "Action failed",
  "agent.automation_created": "Automation created",
  "agent.automation_updated": "Automation changed",
  "agent.automation_deleted": "Automation deleted",
  "agent.automation_run_requested": "Automation run requested",
  "agent.memory_deleted": "Memory deleted",
  "integration.connected": "Tool connected",
  "integration.removed": "Tool removed",
};

type ToolOutline = { tool: string; tier: string; status: string };

function detail(entry: AuditEntry) {
  const meta = entry.metadata;
  if (entry.eventType === "agent.run_completed") {
    const tools = (meta.tools as ToolOutline[] | undefined) ?? [];
    const proposed = (meta.proposedActions as string[] | undefined) ?? [];
    const parts = [
      tools.length ? `${tools.length} tool calls: ${[...new Set(tools.map((tool) => toolLabel(tool.tool)))].join(", ")}` : "No tool calls",
      proposed.length ? `proposed ${proposed.map((tool) => toolLabel(tool)).join(", ")}` : "",
      typeof meta.tokens === "number" ? `${meta.tokens.toLocaleString()} tokens` : "",
    ];
    return parts.filter(Boolean).join(" · ");
  }
  if (entry.eventType.startsWith("agent.action_")) {
    return [meta.summary, meta.error].filter((part) => typeof part === "string").join(" · ");
  }
  if (entry.eventType.startsWith("integration.")) {
    return `${entry.targetId ?? ""}${meta.verified === true ? " · verified" : meta.verified === false ? " · not verified" : ""}`;
  }
  if (typeof meta.name === "string") return meta.name;
  return "";
}

function threadLink(entry: AuditEntry) {
  const threadId = entry.metadata.threadId;
  return typeof threadId === "string" ? `/agent?thread=${threadId}` : null;
}

export default function ActivityPage() {
  const [events, setEvents] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/agent/audit", { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as { events?: AuditEntry[]; error?: string };
        if (!response.ok) {
          throw new Error(
            response.status === 403 ? "Only workspace admins and owners can view activity." : payload.error || "Unable to load activity.",
          );
        }
        if (!cancelled) setEvents(payload.events ?? []);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Unable to load activity.");
          setEvents([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="automations-page">
      <p>
        <Link href="/agent" className="agent-back">
          ← Ask Cohorio
        </Link>
      </p>
      <div className="automations-heading">
        <div>
          <h1>Activity</h1>
          <p>
            Every agent run, approval decision, automation change and tool connection in this workspace,
            newest first. Prompts, tool inputs and credentials are never stored here.
          </p>
        </div>
      </div>
      {error ? <p className="agent-error" role="alert">{error}</p> : null}
      {events === null ? (
        <p className="agent-muted">Loading activity…</p>
      ) : events.length === 0 && !error ? (
        <p className="agent-muted">No activity yet.</p>
      ) : (
        <ul className="automation-list">
          {events.map((entry) => {
            const link = threadLink(entry);
            return (
              <li key={entry.id}>
                <div className="automation-copy">
                  <strong>{EVENT_LABEL[entry.eventType] ?? entry.eventType}</strong>
                  <span>{detail(entry)}</span>
                  <span>
                    {entry.actor ?? "Unknown user"} ·{" "}
                    {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.createdAt))}
                  </span>
                  {link ? <Link href={link}>Open conversation →</Link> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
