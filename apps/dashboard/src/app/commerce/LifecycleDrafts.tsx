"use client";

import { useEffect, useState } from "react";

type LifecycleDraft = {
  id: string;
  name: string;
  trigger: string;
  bodyMarkdown: string;
  status: "draft" | "sent";
  sentAt: string | null;
  createdAt: string;
};

export default function LifecycleDrafts({
  connectionId,
}: {
  connectionId: string | null;
}) {
  const [drafts, setDrafts] = useState<LifecycleDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmingId, setConfirmingId] = useState("");
  const [recipient, setRecipient] = useState("");
  const [sendingId, setSendingId] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/lifecycle/drafts", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as {
          drafts?: LifecycleDraft[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error || "Unable to load lifecycle drafts.");
        }
        if (!cancelled) setDrafts(payload.drafts ?? []);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load lifecycle drafts.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function generate() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/lifecycle/drafts", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          connectionId ? { connectionId } : {},
        ),
      });
      const payload = (await response.json()) as {
        drafts?: LifecycleDraft[];
        error?: string;
      };
      if (!response.ok || !payload.drafts) {
        throw new Error(payload.error || "Unable to create lifecycle drafts.");
      }
      setDrafts((current) => [...payload.drafts!, ...current]);
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : "Unable to create lifecycle drafts.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function send(draft: LifecycleDraft) {
    setSendingId(draft.id);
    setError("");
    try {
      const response = await fetch(`/api/lifecycle/drafts/${draft.id}/send`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, to: recipient.trim() }),
      });
      const payload = (await response.json()) as {
        draft?: LifecycleDraft;
        error?: string;
      };
      if (!response.ok || !payload.draft) {
        throw new Error(payload.error || "Unable to send this draft.");
      }
      setDrafts((current) =>
        current.map((item) => (item.id === draft.id ? payload.draft! : item)),
      );
      setConfirmingId("");
      setRecipient("");
    } catch (sendError) {
      setError(
        sendError instanceof Error ? sendError.message : "Unable to send this draft.",
      );
    } finally {
      setSendingId("");
    }
  }

  return (
    <section className="commerce-lifecycle">
      <div className="commerce-title-row">
        <div>
          <span className="commerce-kicker">Lifecycle</span>
          <h1>Email and retention drafts</h1>
          <p>No attribution until a provider is connected.</p>
        </div>
        <button
          className="commerce-create-flow"
          disabled={saving}
          onClick={generate}
        >
          {saving ? "Writing drafts..." : "Generate lifecycle drafts"}
        </button>
      </div>
      {error ? (
        <p className="commerce-section-empty" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="commerce-section-empty">Loading saved drafts.</p>
      ) : drafts.length ? (
        <div className="commerce-lifecycle-list">
          {drafts.map((draft) => (
            <article key={draft.id}>
              <header>
                <strong>{draft.name}</strong>
                <span>{draft.trigger}</span>
                {draft.status === "sent" ? (
                  <em>
                    Sent
                    {draft.sentAt
                      ? ` ${new Intl.DateTimeFormat("en-US", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(draft.sentAt))}`
                      : ""}
                  </em>
                ) : confirmingId !== draft.id ? (
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingId(draft.id);
                      setRecipient("");
                    }}
                  >
                    Send
                  </button>
                ) : null}
              </header>
              {confirmingId === draft.id && draft.status !== "sent" ? (
                <form
                  className="commerce-lifecycle-confirm"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void send(draft);
                  }}
                >
                  <label>
                    Send this draft through Resend to
                    <input
                      type="email"
                      required
                      value={recipient}
                      onChange={(event) => setRecipient(event.target.value)}
                      placeholder="customer@example.com"
                    />
                  </label>
                  <button type="submit" disabled={sendingId === draft.id || !recipient.trim()}>
                    {sendingId === draft.id ? "Sending..." : "Confirm send"}
                  </button>
                  <button type="button" onClick={() => setConfirmingId("")}>
                    Cancel
                  </button>
                </form>
              ) : null}
              <pre>{draft.bodyMarkdown}</pre>
            </article>
          ))}
        </div>
      ) : (
        <p className="commerce-section-empty">
          Generate four drafts from Brand Brain. Nothing is sent until you confirm a
          send through a connected Resend key.
        </p>
      )}
    </section>
  );
}
