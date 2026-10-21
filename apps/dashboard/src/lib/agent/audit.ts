import { writeAuditEvent } from "@/lib/auth/repository";
import { query } from "@/lib/database";

export type AgentAuditEvent =
  | "agent.run_completed"
  | "agent.run_failed"
  | "agent.action_approved"
  | "agent.action_rejected"
  | "agent.action_executed"
  | "agent.action_failed"
  | "agent.automation_created"
  | "agent.automation_updated"
  | "agent.automation_deleted"
  | "agent.automation_run_requested"
  | "agent.memory_deleted"
  | "integration.connected"
  | "integration.removed";

/**
 * Records an agent or integration event in audit_events. Metadata must never
 * contain credentials, prompts or tool inputs: names, ids and statuses only.
 * Failures are logged, not thrown, so auditing never breaks the action itself.
 */
export async function auditAgentEvent(input: {
  workspaceId: string;
  actorUserId: string | null;
  eventType: AgentAuditEvent;
  targetType?: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await writeAuditEvent({
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      eventType: input.eventType,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      metadata: input.metadata ?? {},
    });
  } catch (error) {
    console.error(`Audit write failed for ${input.eventType}`, error);
  }
}

export type AuditEntry = {
  id: string;
  eventType: string;
  targetType: string | null;
  targetId: string | null;
  actor: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export async function listAgentAudit(workspaceId: string, limit = 200) {
  const result = await query<{
    id: string;
    event_type: string;
    target_type: string | null;
    target_id: string | null;
    actor: string | null;
    metadata: Record<string, unknown>;
    created_at: Date;
  }>(
    `SELECT event.id::text, event.event_type, event.target_type, event.target_id,
            COALESCE(NULLIF(actor.name, ''), actor.email::text) AS actor,
            event.metadata, event.created_at
       FROM audit_events event
       LEFT JOIN users actor ON actor.id = event.actor_user_id
      WHERE event.workspace_id = $1
        AND (event.event_type LIKE 'agent.%' OR event.event_type LIKE 'integration.%')
      ORDER BY event.created_at DESC
      LIMIT $2`,
    [workspaceId, limit],
  );
  return result.rows.map(
    (row): AuditEntry => ({
      id: row.id,
      eventType: row.event_type,
      targetType: row.target_type,
      targetId: row.target_id,
      actor: row.actor,
      metadata: row.metadata ?? {},
      createdAt: new Date(row.created_at).toISOString(),
    }),
  );
}
