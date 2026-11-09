"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { WorkspaceMemory } from "@/lib/agent/repository";
import "../agent.css";

const MAX_LENGTH = 300;

type MemoriesPayload = { memories: WorkspaceMemory[]; limit: number };

async function readError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  return payload.error || fallback;
}

async function loadMemories() {
  const response = await fetch("/api/agent/memories", { cache: "no-store" });
  if (!response.ok) throw new Error(await readError(response, "Unable to load memories."));
  return (await response.json()) as MemoriesPayload;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(iso));
}

export default function MemoriesPage() {
  const [memories, setMemories] = useState<WorkspaceMemory[] | null>(null);
  const [limit, setLimit] = useState(50);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await loadMemories();
        if (cancelled) return;
        setMemories(data.memories);
        setLimit(data.limit);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Unable to load memories.");
          setMemories([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const atLimit = (memories?.length ?? 0) >= limit;

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/agent/memories", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!response.ok) throw new Error(await readError(response, "Unable to save this memory."));
      const payload = (await response.json()) as { memory: WorkspaceMemory };
      setMemories((current) => [...(current ?? []), payload.memory]);
      setDraft("");
      setMessage("Memory saved. Cohorio will use it in future conversations.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save this memory.");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(memory: WorkspaceMemory) {
    const content = editDraft.trim();
    if (!content) return;
    setBusyId(memory.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/agent/memories/${memory.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!response.ok) throw new Error(await readError(response, "Unable to update this memory."));
      const payload = (await response.json()) as { memory: WorkspaceMemory };
      setMemories((current) =>
        (current ?? []).map((item) => (item.id === payload.memory.id ? payload.memory : item)),
      );
      setEditingId(null);
      setMessage("Memory updated.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update this memory.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(memory: WorkspaceMemory) {
    setBusyId(memory.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/agent/memories/${memory.id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error(await readError(response, "Unable to delete this memory."));
      setMemories((current) => (current ?? []).filter((item) => item.id !== memory.id));
      setConfirmDeleteId(null);
      setMessage("Memory deleted.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete this memory.");
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
          <h1>Memories</h1>
          <p>
            Durable preferences Cohorio applies in every conversation in this workspace. The agent
            saves one when you express a lasting preference; you can add, change or remove them here.
            Keep them short, and never store secrets or personal data.
          </p>
        </div>
      </div>

      {message ? <p className="automations-message" role="status">{message}</p> : null}
      {error ? <p className="agent-error" role="alert">{error}</p> : null}

      <form className="automation-form" onSubmit={add}>
        <label>
          Add a memory
          <textarea
            rows={2}
            maxLength={MAX_LENGTH}
            value={draft}
            disabled={atLimit}
            placeholder="e.g. Never use emojis in LinkedIn posts."
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <div className="agent-action-buttons">
          <button
            type="submit"
            className="agent-button agent-button-primary"
            disabled={saving || atLimit || !draft.trim()}
          >
            {saving ? "Saving…" : "Save memory"}
          </button>
          <span className="agent-muted">
            {memories === null ? "" : `${memories.length} of ${limit} memories`}
            {atLimit ? " — delete one before adding another." : ""}
          </span>
        </div>
      </form>

      {memories === null ? (
        <p className="agent-muted">Loading memories…</p>
      ) : memories.length === 0 ? (
        <p className="agent-muted">No memories yet. Add one above, or ask Cohorio to remember a preference.</p>
      ) : (
        <ul className="automation-list">
          {memories.map((memory) => (
            <li key={memory.id}>
              {editingId === memory.id ? (
                <form
                  className="memory-edit"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveEdit(memory);
                  }}
                >
                  <textarea
                    aria-label="Memory"
                    rows={2}
                    maxLength={MAX_LENGTH}
                    value={editDraft}
                    autoFocus
                    onChange={(event) => setEditDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setEditingId(null);
                    }}
                  />
                  <div className="agent-action-buttons">
                    <button
                      type="submit"
                      className="agent-button agent-button-primary"
                      disabled={busyId === memory.id || !editDraft.trim()}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="agent-button"
                      disabled={busyId === memory.id}
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="automation-copy">
                    <span className="memory-content">{memory.content}</span>
                    <span>Saved {formatDate(memory.createdAt)}</span>
                  </div>
                  <div className="agent-action-buttons">
                    {confirmDeleteId === memory.id ? (
                      <>
                        <button
                          type="button"
                          className="agent-button"
                          disabled={busyId === memory.id}
                          onClick={() => void remove(memory)}
                        >
                          Confirm delete
                        </button>
                        <button
                          type="button"
                          className="agent-button"
                          disabled={busyId === memory.id}
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Keep
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="agent-button"
                          disabled={busyId === memory.id}
                          onClick={() => {
                            setEditDraft(memory.content);
                            setEditingId(memory.id);
                            setConfirmDeleteId(null);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="agent-button"
                          disabled={busyId === memory.id}
                          onClick={() => setConfirmDeleteId(memory.id)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
