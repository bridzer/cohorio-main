"use client";

import { useEffect, useState } from "react";

type LifecycleDraft = {
  id: string;
  name: string;
  trigger: string;
  bodyMarkdown: string;
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
              </header>
              <pre>{draft.bodyMarkdown}</pre>
            </article>
          ))}
        </div>
      ) : (
        <p className="commerce-section-empty">
          Generate three drafts from Brand Brain. Nothing is sent to an email provider.
        </p>
      )}
    </section>
  );
}
