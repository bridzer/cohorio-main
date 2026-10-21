"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { Automation } from "@/lib/agent/automations";
import { WEEKDAYS } from "@/lib/agent/schedule";
import "../agent.css";

type Draft = {
  name: string;
  prompt: string;
  frequency: "daily" | "weekly";
  weekday: number;
  hour: number;
  timezone: string;
  notifyEmail: boolean;
};

const TEMPLATES: { name: string; prompt: string; frequency: Draft["frequency"]; weekday: number }[] = [
  {
    name: "Weekly Shopify digest",
    prompt:
      "Review last week's Shopify performance. Summarize revenue and orders versus the prior week, name the three products that most need attention and why, and recommend three concrete actions for this week.",
    frequency: "weekly",
    weekday: 1,
  },
  {
    name: "Product page check",
    prompt:
      "Score my product pages and draft improved copy for the two weakest ones. Save nothing externally; give me the drafts.",
    frequency: "weekly",
    weekday: 3,
  },
  {
    name: "Weekly social drafts",
    prompt:
      "Write five LinkedIn posts for this week grounded in our Brand Brain and recent work, and save them as drafts in Social Studio.",
    frequency: "weekly",
    weekday: 5,
  },
];

function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const emptyDraft = (): Draft => ({
  name: "",
  prompt: "",
  frequency: "weekly",
  weekday: 1,
  hour: 9,
  timezone: browserTimezone(),
  notifyEmail: true,
});

function formatWhen(iso: string | null) {
  if (!iso) return "Never";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

async function readError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  return payload.error || fallback;
}

type AutomationsPayload = {
  automations: Automation[];
  workerOnline: boolean;
  emailConfigured: boolean;
};

async function loadAutomations() {
  const response = await fetch("/api/agent/automations", { cache: "no-store" });
  if (!response.ok) throw new Error(await readError(response, "Unable to load automations."));
  return (await response.json()) as AutomationsPayload;
}

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[] | null>(null);
  const [workerOnline, setWorkerOnline] = useState(true);
  const [emailConfigured, setEmailConfigured] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const data = await loadAutomations();
      setAutomations(data.automations);
      setWorkerOnline(data.workerOnline);
      setEmailConfigured(data.emailConfigured);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load automations.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await loadAutomations();
        if (cancelled) return;
        setAutomations(data.automations);
        setWorkerOnline(data.workerOnline);
        setEmailConfigured(data.emailConfigured);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Unable to load automations.");
          setAutomations([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/agent/automations", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          weekday: draft.frequency === "weekly" ? draft.weekday : null,
        }),
      });
      if (!response.ok) throw new Error(await readError(response, "Unable to save this automation."));
      setDraft(null);
      setMessage("Automation saved.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save this automation.");
    } finally {
      setSaving(false);
    }
  }

  async function act(automation: Automation, action: "toggle" | "run" | "delete") {
    if (action === "delete" && !window.confirm(`Delete "${automation.name}"?`)) return;
    setBusyId(automation.id);
    setError("");
    setMessage("");
    try {
      const url =
        action === "run"
          ? `/api/agent/automations/${automation.id}/run`
          : `/api/agent/automations/${automation.id}`;
      const response = await fetch(url, {
        method: action === "run" ? "POST" : action === "delete" ? "DELETE" : "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: action === "toggle" ? JSON.stringify({ enabled: !automation.enabled }) : undefined,
      });
      if (!response.ok) throw new Error(await readError(response, "That did not work."));
      if (action === "run") {
        setMessage(
          workerOnline
            ? `"${automation.name}" is queued and will start within a minute.`
            : `"${automation.name}" is queued, but no worker is running to pick it up.`,
        );
      }
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That did not work.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="automations-page">
      <p>
        <Link href="/agent" className="agent-back">
          ← Ask Cohorio
        </Link>
      </p>
      <div className="automations-heading">
        <div>
          <h1>Automations</h1>
          <p>
            Scheduled agent runs. Each one works in its own conversation, saves drafts, and waits for
            your approval before anything is sent or published.
          </p>
        </div>
        {!draft ? (
          <button type="button" className="agent-button agent-button-primary" onClick={() => setDraft(emptyDraft())}>
            New automation
          </button>
        ) : null}
      </div>

      {!workerOnline ? (
        <p className="agent-error" role="status">
          No background worker is running, so automations will not run on schedule. Set
          COHORIO_WORKER_ENABLED=true on the server to start one.
        </p>
      ) : null}
      {!emailConfigured ? (
        <p className="agent-note">Email notifications are off because RESEND_API_KEY or AUTH_EMAIL_FROM is not set.</p>
      ) : null}
      {message ? <p className="automations-message" role="status">{message}</p> : null}
      {error ? <p className="agent-error" role="alert">{error}</p> : null}

      {draft ? (
        <form className="automation-form" onSubmit={save}>
          <div className="automation-templates">
            <span>Start from</span>
            {TEMPLATES.map((template) => (
              <button
                key={template.name}
                type="button"
                onClick={() => setDraft({ ...draft, ...template })}
              >
                {template.name}
              </button>
            ))}
          </div>
          <label>
            Name
            <input
              required
              maxLength={80}
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>
          <label>
            What should Cohorio do?
            <textarea
              required
              maxLength={4_000}
              rows={4}
              value={draft.prompt}
              onChange={(event) => setDraft({ ...draft, prompt: event.target.value })}
            />
          </label>
          <div className="automation-schedule">
            <label>
              Repeat
              <select
                value={draft.frequency}
                onChange={(event) =>
                  setDraft({ ...draft, frequency: event.target.value as Draft["frequency"] })
                }
              >
                <option value="daily">Every day</option>
                <option value="weekly">Every week</option>
              </select>
            </label>
            {draft.frequency === "weekly" ? (
              <label>
                On
                <select
                  value={draft.weekday}
                  onChange={(event) => setDraft({ ...draft, weekday: Number(event.target.value) })}
                >
                  {WEEKDAYS.map((day, index) => (
                    <option key={day} value={index}>
                      {day}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label>
              At
              <select
                value={draft.hour}
                onChange={(event) => setDraft({ ...draft, hour: Number(event.target.value) })}
              >
                {Array.from({ length: 24 }, (_, hour) => (
                  <option key={hour} value={hour}>
                    {String(hour).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </label>
            <label>
              Timezone
              <input
                required
                value={draft.timezone}
                onChange={(event) => setDraft({ ...draft, timezone: event.target.value })}
              />
            </label>
          </div>
          <label className="automation-checkbox">
            <input
              type="checkbox"
              checked={draft.notifyEmail}
              onChange={(event) => setDraft({ ...draft, notifyEmail: event.target.checked })}
            />
            Email me when it finishes
          </label>
          <div className="agent-action-buttons">
            <button type="submit" className="agent-button agent-button-primary" disabled={saving}>
              {saving ? "Saving…" : "Save automation"}
            </button>
            <button type="button" className="agent-button" disabled={saving} onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {automations === null ? (
        <p className="agent-muted">Loading automations…</p>
      ) : automations.length === 0 && !draft ? (
        <p className="agent-muted">No automations yet.</p>
      ) : (
        <ul className="automation-list">
          {automations.map((automation) => (
            <li key={automation.id} className={automation.enabled ? "" : "paused"}>
              <div className="automation-copy">
                <strong>{automation.name}</strong>
                <span>{automation.scheduleLabel}</span>
                <span>
                  {automation.enabled ? `Next run ${formatWhen(automation.nextRunAt)}` : "Paused"} · Last run{" "}
                  {formatWhen(automation.lastRunAt)}
                  {automation.lastStatus ? ` (${automation.lastStatus})` : ""}
                </span>
                {automation.lastError ? <span className="agent-action-error">{automation.lastError}</span> : null}
                {automation.threadId ? (
                  <Link href={`/agent?thread=${automation.threadId}`}>Open conversation →</Link>
                ) : null}
              </div>
              <div className="agent-action-buttons">
                <button
                  type="button"
                  className="agent-button"
                  disabled={busyId === automation.id}
                  onClick={() => void act(automation, "run")}
                >
                  Run now
                </button>
                <button
                  type="button"
                  className="agent-button"
                  disabled={busyId === automation.id}
                  onClick={() => void act(automation, "toggle")}
                >
                  {automation.enabled ? "Pause" : "Resume"}
                </button>
                <button
                  type="button"
                  className="agent-button"
                  disabled={busyId === automation.id}
                  onClick={() => void act(automation, "delete")}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
