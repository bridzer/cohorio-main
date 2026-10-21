"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import type {
  AgentAction,
  AgentRunRecord,
  AgentThread,
  ThreadMessage,
} from "@/lib/agent/repository";
import {
  formatDuration,
  STOP_REASON_NOTE,
  toolLabel,
  toolProgressLabel,
} from "@/lib/agent-ui/labels";
import { PENDING_PROMPT_KEY } from "@/lib/agent-ui/handoff";
import { readEventStream } from "@/lib/agent-ui/sse";
import { Markdown } from "./Markdown";


type StepOutline = {
  tool: string;
  tier: string;
  status: "ok" | "error" | "approval_required";
  durationMs: number;
  link?: string;
  input?: unknown;
};

type ThreadDetail = {
  thread: AgentThread;
  messages: ThreadMessage[];
  runs: AgentRunRecord[];
  actions: AgentAction[];
};

type LiveTurn = { prompt: string; steps: StepOutline[]; active: string | null };

const SUGGESTIONS = [
  "Audit my weakest Shopify product pages and tell me what to fix first.",
  "Draft a Meta campaign for my best-selling product.",
  "Write a week of LinkedIn posts from our positioning and save them as drafts.",
  "What should our pricing page say? Use our Brand Brain.",
];

const LINK_LABEL: Record<string, string> = {
  "/social": "Social Studio",
  "/commerce": "Commerce",
  "/launch": "Launch",
  "/revops": "RevOps",
  "/library": "Library",
};

const TIER_LABEL: Record<string, string> = {
  read: "Read",
  draft: "Draft",
  external: "Needs approval",
};

const STATUS_LABEL: Record<AgentAction["status"], string> = {
  pending: "Waiting for approval",
  approved: "Running",
  rejected: "Rejected",
  executed: "Done",
  failed: "Failed",
};

async function fetchLists() {
  const [threadResponse, actionResponse] = await Promise.all([
    fetch("/api/agent/threads", { cache: "no-store" }),
    fetch("/api/agent/actions?status=pending", { cache: "no-store" }),
  ]);
  return {
    threads: threadResponse.ok
      ? ((await threadResponse.json()) as { threads: AgentThread[] }).threads
      : null,
    pending: actionResponse.ok
      ? ((await actionResponse.json()) as { actions: AgentAction[] }).actions
      : null,
  };
}

async function fetchDetail(threadId: string): Promise<ThreadDetail | null | undefined> {
  const response = await fetch(`/api/agent/threads/${threadId}`, { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) return undefined;
  return (await response.json()) as ThreadDetail;
}

function StepRow({ step }: { step: StepOutline }) {
  return (
    <li className={`agent-step agent-step-${step.status}`}>
      <span className="agent-step-dot" aria-hidden="true" />
      <span className="agent-step-label">{toolLabel(step.tool, step.input)}</span>
      <span className={`agent-tier agent-tier-${step.tier}`}>
        {TIER_LABEL[step.tier] ?? step.tier}
      </span>
      <span className="agent-step-time">
        {step.status === "error" ? "Failed" : formatDuration(step.durationMs)}
      </span>
    </li>
  );
}

function SavedLinks({ steps }: { steps: StepOutline[] }) {
  const links = [...new Set(steps.map((step) => step.link).filter(Boolean))] as string[];
  if (!links.length) return null;
  return (
    <div className="agent-saved-links">
      {links.map((link) => (
        <Link key={link} href={link}>
          Saved to {LINK_LABEL[link.split("?")[0]] ?? link} →
        </Link>
      ))}
    </div>
  );
}

function RunDetails({ run }: { run: AgentRunRecord }) {
  const total = run.steps.reduce((sum, step) => sum + step.durationMs, 0);
  return (
    <>
      <SavedLinks steps={run.steps} />
      {run.stopReason && STOP_REASON_NOTE[run.stopReason] ? (
        <p className="agent-note">{STOP_REASON_NOTE[run.stopReason]}</p>
      ) : null}
      {run.steps.length ? (
        <details className="agent-run">
          <summary>
            {run.steps.length} {run.steps.length === 1 ? "step" : "steps"}
            {run.skills.length ? ` · ${run.skills.join(", ")}` : ""} · {formatDuration(total)}
          </summary>
          <ol className="agent-steps">
            {run.steps.map((step, index) => (
              <StepRow key={index} step={step} />
            ))}
          </ol>
          <p className="agent-usage">
            {run.usage.modelCalls} model calls ·{" "}
            {(run.usage.promptTokens + run.usage.completionTokens).toLocaleString()} tokens
          </p>
        </details>
      ) : null}
    </>
  );
}

function ActionCard({
  action,
  busy,
  confirming,
  error,
  onConfirm,
  onCancel,
  onDecide,
}: {
  action: AgentAction;
  busy: boolean;
  confirming: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
  onDecide: (decision: "approve" | "reject") => void;
}) {
  return (
    <div className={`agent-action agent-action-${action.status}`}>
      <div className="agent-action-copy">
        <span className="agent-action-kicker">{toolLabel(action.tool)}</span>
        <strong>{action.summary}</strong>
        <span className="agent-action-status">{STATUS_LABEL[action.status]}</span>
        {action.error ? <span className="agent-action-error">{action.error}</span> : null}
        {error ? <span className="agent-action-error">{error}</span> : null}
      </div>
      {action.status === "pending" ? (
        <div className="agent-action-buttons">
          {confirming ? (
            <>
              <button
                type="button"
                className="agent-button agent-button-primary"
                disabled={busy}
                onClick={() => onDecide("approve")}
              >
                {busy ? "Running…" : "Confirm and run"}
              </button>
              <button type="button" className="agent-button" disabled={busy} onClick={onCancel}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="agent-button agent-button-primary"
                disabled={busy}
                onClick={onConfirm}
              >
                Approve
              </button>
              <button
                type="button"
                className="agent-button"
                disabled={busy}
                onClick={() => onDecide("reject")}
              >
                Reject
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="agent-link-button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function AgentWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const threadId = searchParams.get("thread");

  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [threads, setThreads] = useState<AgentThread[]>([]);
  const [pending, setPending] = useState<AgentAction[]>([]);
  const [input, setInput] = useState("");
  const [live, setLive] = useState<LiveTurn | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [confirmingAction, setConfirmingAction] = useState<string | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

  const abortRef = useRef<AbortController | null>(null);
  // The thread a stream is writing into; its detail reloads only when the run ends.
  const streamingThreadRef = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const shown = threadId && detail?.thread.id === threadId ? detail : null;

  async function refreshLists() {
    try {
      const lists = await fetchLists();
      if (lists.threads) setThreads(lists.threads);
      if (lists.pending) setPending(lists.pending);
    } catch {
      // Lists are secondary; the conversation stays usable.
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const lists = await fetchLists();
        if (cancelled) return;
        if (lists.threads) setThreads(lists.threads);
        if (lists.pending) setPending(lists.pending);
      } catch {
        // Lists are secondary; the conversation stays usable.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!threadId || streamingThreadRef.current === threadId) return;
    let cancelled = false;
    void (async () => {
      const data = await fetchDetail(threadId);
      if (cancelled) return;
      if (data === null) router.replace("/agent");
      else if (data) setDetail(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [threadId, router]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [shown?.messages.length, live?.steps.length, live?.active, live?.prompt]);

  async function send(prompt: string) {
    const clean = prompt.trim();
    if (!clean || running) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const startingThread = threadId;
    let activeThread = startingThread;
    streamingThreadRef.current = startingThread ?? "new";
    setInput("");
    setError("");
    setRunning(true);
    setLive({ prompt: clean, steps: [], active: null });

    try {
      const response = await fetch("/api/agent/runs", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: clean, threadId: startingThread ?? undefined, stream: true }),
        signal: controller.signal,
      });
      const isStream = response.headers.get("content-type")?.includes("text/event-stream");
      if (!response.ok || !response.body || !isStream) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Cohorio could not finish this request.");
      }
      let failure = "";
      await readEventStream(response.body, ({ event, data }) => {
        const payload = data as Record<string, unknown>;
        if (event === "thread" && typeof payload.threadId === "string") {
          activeThread = payload.threadId;
          streamingThreadRef.current = payload.threadId;
          if (payload.threadId !== startingThread) {
            router.replace(`/agent?thread=${payload.threadId}`, { scroll: false });
          }
        } else if (event === "tool_start" && typeof payload.tool === "string") {
          const tool = payload.tool;
          setLive((current) => current && { ...current, active: tool });
        } else if (event === "tool_end" && payload.step) {
          const step = payload.step as StepOutline;
          setLive((current) => current && { ...current, active: null, steps: [...current.steps, step] });
        } else if (event === "error") {
          failure = typeof payload.error === "string" ? payload.error : "Cohorio could not finish this request.";
        }
      });
      if (failure) throw new Error(failure);
      const data = activeThread ? await fetchDetail(activeThread) : undefined;
      if (data) setDetail(data);
      setLive(null);
    } catch (caught) {
      const aborted = controller.signal.aborted;
      setError(
        aborted
          ? "Stopped. Anything already saved stays saved."
          : caught instanceof Error
            ? caught.message
            : "Cohorio could not finish this request.",
      );
      const data = activeThread ? await fetchDetail(activeThread).catch(() => undefined) : undefined;
      if (data) {
        setDetail(data);
      } else {
        // Nothing was stored (for example the quota check failed), so give the prompt back.
        setInput((current) => current || clean);
      }
      setLive(null);
    } finally {
      streamingThreadRef.current = null;
      abortRef.current = null;
      setRunning(false);
      void refreshLists();
    }
  }

  useEffect(() => {
    // Picks up a prompt handed over from another page. The timer is cancelled by
    // StrictMode's test unmount, so the prompt is consumed and sent exactly once.
    const timer = setTimeout(() => {
      const handedOver = sessionStorage.getItem(PENDING_PROMPT_KEY);
      if (!handedOver) return;
      sessionStorage.removeItem(PENDING_PROMPT_KEY);
      void send(handedOver);
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function decide(action: AgentAction, decision: "approve" | "reject") {
    setBusyAction(action.id);
    setActionErrors((current) => {
      const next = { ...current };
      delete next[action.id];
      return next;
    });
    try {
      const response = await fetch(`/api/agent/actions/${action.id}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(decision === "approve" ? { decision, confirm: true } : { decision }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setActionErrors((current) => ({
          ...current,
          [action.id]: payload.error || "Unable to record this decision.",
        }));
      }
      if (shown && action.threadId === shown.thread.id) {
        const data = await fetchDetail(action.threadId);
        if (data) setDetail(data);
      }
    } finally {
      setBusyAction(null);
      setConfirmingAction(null);
      void refreshLists();
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(input);
  }

  function onComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(input);
    }
  }

  const runsById = useMemo(
    () => new Map((shown?.runs ?? []).map((run) => [run.id, run])),
    [shown],
  );
  const actionsByRun = useMemo(() => {
    const grouped = new Map<string, AgentAction[]>();
    for (const action of [...(shown?.actions ?? [])].reverse()) {
      if (!action.runId) continue;
      grouped.set(action.runId, [...(grouped.get(action.runId) ?? []), action]);
    }
    return grouped;
  }, [shown]);

  const empty = !shown && !live;

  return (
    <div className="agent-shell">
      <aside className="agent-sidebar" aria-label="Conversations">
        <Link href="/" className="agent-back">
          ← Home
        </Link>
        <button
          type="button"
          className="agent-button agent-button-primary agent-new"
          disabled={running}
          onClick={() => {
            setError("");
            router.push("/agent");
          }}
        >
          New conversation
        </button>
        <Link href="/agent/automations" className="agent-automations-link">
          Automations →
        </Link>
        <Link href="/agent/activity" className="agent-automations-link">
          Activity →
        </Link>

        {pending.length ? (
          <section className="agent-sidebar-section">
            <h2>Waiting for approval · {pending.length}</h2>
            <ul>
              {pending.map((action) => (
                <li key={action.id}>
                  <Link href={`/agent?thread=${action.threadId}`} className="agent-pending-link">
                    {action.summary}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="agent-sidebar-section">
          <h2>Recent</h2>
          {threads.length ? (
            <ul>
              {threads.map((thread) => (
                <li key={thread.id}>
                  <Link
                    href={`/agent?thread=${thread.id}`}
                    className={`agent-thread-link ${thread.id === threadId ? "active" : ""}`}
                    aria-current={thread.id === threadId ? "page" : undefined}
                  >
                    {thread.title}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="agent-muted">No conversations yet.</p>
          )}
        </section>
      </aside>

      <main className="agent-main">
        <header className="agent-header">
          <div>
            <p className="agent-eyebrow">Cohorio agent</p>
            <h1>{shown?.thread.title ?? (live ? "New conversation" : "Ask Cohorio")}</h1>
          </div>
        </header>

        <div className="agent-transcript" aria-live="polite">
          {empty ? (
            <div className="agent-empty">
              <h2>What should we move forward?</h2>
              <p>
                Cohorio uses your Brand Brain, store data and 50 expert playbooks. It saves drafts for
                you and asks before anything is sent or published.
              </p>
              <div className="agent-suggestions">
                {SUGGESTIONS.map((suggestion) => (
                  <button key={suggestion} type="button" onClick={() => setInput(suggestion)}>
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {shown?.messages.map((message) => {
            if (message.role === "user") {
              return (
                <div key={message.id} className="agent-message agent-message-user">
                  <p>{message.content}</p>
                </div>
              );
            }
            if (message.role === "event") {
              return (
                <p key={message.id} className="agent-event">
                  {message.content}
                </p>
              );
            }
            const run = message.runId ? runsById.get(message.runId) : undefined;
            const actions = message.runId ? (actionsByRun.get(message.runId) ?? []) : [];
            return (
              <article key={message.id} className="agent-message agent-message-assistant">
                <Markdown text={message.content} />
                {run ? <RunDetails run={run} /> : null}
                {actions.map((action) => (
                  <ActionCard
                    key={action.id}
                    action={action}
                    busy={busyAction === action.id}
                    confirming={confirmingAction === action.id}
                    error={actionErrors[action.id]}
                    onConfirm={() => setConfirmingAction(action.id)}
                    onCancel={() => setConfirmingAction(null)}
                    onDecide={(decision) => void decide(action, decision)}
                  />
                ))}
                <div className="agent-message-tools">
                  <CopyButton text={message.content} />
                </div>
              </article>
            );
          })}

          {live ? (
            <>
              <div className="agent-message agent-message-user">
                <p>{live.prompt}</p>
              </div>
              <div className="agent-message agent-message-assistant agent-live">
                {live.steps.length ? (
                  <ol className="agent-steps">
                    {live.steps.map((step, index) => (
                      <StepRow key={index} step={step} />
                    ))}
                  </ol>
                ) : null}
                <p className="agent-working">
                  <span className="agent-spinner" aria-hidden="true" />
                  {live.active ? toolProgressLabel(live.active) : "Thinking…"}
                </p>
              </div>
            </>
          ) : null}

          {error ? (
            <p className="agent-error" role="alert">
              {error}
            </p>
          ) : null}
          <div ref={endRef} />
        </div>

        <form className="agent-composer" onSubmit={submit}>
          <textarea
            aria-label="Message Cohorio"
            placeholder={shown ? "Reply to Cohorio" : "Ask Cohorio to research, draft or plan"}
            value={input}
            rows={2}
            maxLength={8_000}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onComposerKey}
          />
          {running ? (
            <button type="button" className="agent-button" onClick={() => abortRef.current?.abort()}>
              Stop
            </button>
          ) : (
            <button type="submit" className="agent-button agent-button-primary" disabled={!input.trim()}>
              Send
            </button>
          )}
        </form>
      </main>
    </div>
  );
}
