"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CONTEXT_SECTIONS,
  contextProgress,
  contextToMarkdown,
  isSectionComplete,
  type ContextSectionId,
  type ContextSectionValues,
  type MarketingContext,
} from "@/lib/marketing-context";
import "./onboarding.css";

type ContextResponse = {
  context: MarketingContext;
  updatedAt: string | null;
  error?: string;
};

const OPTIONAL_SECTIONS = new Set<ContextSectionId>([
  "personas",
  "competition",
  "proofPoints",
]);

export default function ProductContextOnboarding() {
  const router = useRouter();
  const [context, setContext] = useState<MarketingContext>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const activeSection = CONTEXT_SECTIONS[activeIndex];
  const progress = useMemo(() => contextProgress(context), [context]);
  const markdown = useMemo(
    () => contextToMarkdown(context, updatedAt ?? undefined),
    [context, updatedAt],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/marketing-context");
        const data = (await response.json()) as ContextResponse;
        if (!response.ok) throw new Error(data.error ?? "Unable to load context.");
        if (cancelled) return;
        setContext(data.context ?? {});
        setUpdatedAt(data.updatedAt);
        const firstIncomplete = CONTEXT_SECTIONS.findIndex(
          (section) => !isSectionComplete(section.id, data.context?.[section.id]),
        );
        setActiveIndex(firstIncomplete < 0 ? 0 : firstIncomplete);
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to load context.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function updateValues(nextValues: ContextSectionValues) {
    setContext((current) => ({
      ...current,
      [activeSection.id]: nextValues,
    }));
    setError("");
    setNotice("");
  }

  async function saveSection(moveForward: boolean) {
    const values = context[activeSection.id] ?? {};
    if (values._notApplicable !== "true") {
      const missing = activeSection.fields.find(
        (field) => field.required && !values[field.id]?.trim(),
      );
      if (missing) {
        setError(`Complete “${missing.label}” before continuing.`);
        return;
      }
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/marketing-context", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId: activeSection.id, values }),
      });
      const data = (await response.json()) as ContextResponse;
      if (!response.ok) throw new Error(data.error ?? "Unable to save context.");
      setContext(data.context);
      setUpdatedAt(data.updatedAt);
      setNotice(`${activeSection.title} saved.`);
      if (moveForward) {
        if (activeIndex === CONTEXT_SECTIONS.length - 1) {
          setShowPreview(true);
        } else {
          setActiveIndex((current) => current + 1);
        }
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to save context.",
      );
    } finally {
      setSaving(false);
    }
  }

  function downloadMarkdown() {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "product-marketing-context.md";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function copyMarkdown() {
    await navigator.clipboard.writeText(markdown);
    setNotice("Markdown copied to your clipboard.");
  }

  if (loading) {
    return (
      <main className="context-loading">
        <div className="context-loading-mark">C</div>
        <p>Loading your Brand Brain…</p>
      </main>
    );
  }

  const values = context[activeSection.id] ?? {};
  const isOptional = OPTIONAL_SECTIONS.has(activeSection.id);

  return (
    <main className="context-shell">
      <aside className="context-sidebar">
        <button className="context-brand" onClick={() => router.push("/")}>
          <span className="context-brand-mark">C</span>
          <span>
            <strong>Cohorio</strong>
            <small>Brand Brain</small>
          </span>
        </button>

        <div className="context-progress-summary">
          <div>
            <span>Setup progress</span>
            <strong>{progress.percentage}%</strong>
          </div>
          <div className="context-progress-track">
            <span style={{ width: `${progress.percentage}%` }} />
          </div>
          <p>
            {progress.completedCount} of {progress.totalSections} sections complete
          </p>
        </div>

        <nav aria-label="Product context sections">
          {CONTEXT_SECTIONS.map((section, index) => {
            const complete = isSectionComplete(section.id, context[section.id]);
            return (
              <button
                key={section.id}
                className={index === activeIndex && !showPreview ? "active" : ""}
                onClick={() => {
                  setActiveIndex(index);
                  setShowPreview(false);
                  setError("");
                  setNotice("");
                }}
              >
                <span className={complete ? "complete" : ""}>
                  {complete ? "✓" : index + 1}
                </span>
                {section.shortTitle}
              </button>
            );
          })}
          <button
            className={showPreview ? "active" : ""}
            onClick={() => setShowPreview(true)}
          >
            <span>↗</span>
            Review context
          </button>
        </nav>

        <button className="context-exit" onClick={() => router.push("/")}>
          ← Back to dashboard
        </button>
      </aside>

      <section className="context-main">
        <header className="context-topbar">
          <div>
            <span>Product marketing context</span>
            {updatedAt && (
              <small>
                Saved {new Date(updatedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </small>
            )}
          </div>
          <button onClick={() => setShowPreview(true)}>Preview document</button>
        </header>

        {showPreview ? (
          <div className="context-preview-wrap">
            <div className="context-page-heading">
              <span className="context-step-label">Review</span>
              <h1>Your product marketing context</h1>
              <p>
                This living brief grounds Cohorio’s future copy, strategy, and
                campaign work in the same source of truth.
              </p>
            </div>
            <div className="context-preview-actions">
              <button onClick={() => void copyMarkdown()}>Copy markdown</button>
              <button onClick={downloadMarkdown}>Download .md</button>
              <button className="primary" onClick={() => router.push("/")}>
                Finish setup
              </button>
            </div>
            {notice && <p className="context-notice">{notice}</p>}
            <pre className="context-document">{markdown}</pre>
          </div>
        ) : (
          <div className="context-form-wrap">
            <div className="context-page-heading">
              <span className="context-step-label">
                Section {activeIndex + 1} of {CONTEXT_SECTIONS.length}
              </span>
              <h1>{activeSection.title}</h1>
              <p>{activeSection.description}</p>
            </div>

            {isOptional && (
              <label className="context-skip">
                <input
                  type="checkbox"
                  checked={values._notApplicable === "true"}
                  onChange={(event) =>
                    updateValues({
                      ...values,
                      _notApplicable: event.target.checked ? "true" : "false",
                    })
                  }
                />
                <span>
                  <strong>Not applicable right now</strong>
                  You can revisit this section as your business evolves.
                </span>
              </label>
            )}

            <div
              className={`context-fields ${
                values._notApplicable === "true" ? "disabled" : ""
              }`}
            >
              {activeSection.fields.map((field) => (
                <label key={field.id}>
                  <span>
                    {field.label}
                    {field.required && <em>Required</em>}
                  </span>
                  {field.multiline ? (
                    <textarea
                      rows={field.id === "whatItDoes" ? 4 : 3}
                      value={values[field.id] ?? ""}
                      disabled={values._notApplicable === "true"}
                      placeholder={field.placeholder}
                      onChange={(event) =>
                        updateValues({
                          ...values,
                          [field.id]: event.target.value,
                        })
                      }
                    />
                  ) : (
                    <input
                      value={values[field.id] ?? ""}
                      disabled={values._notApplicable === "true"}
                      placeholder={field.placeholder}
                      onChange={(event) =>
                        updateValues({
                          ...values,
                          [field.id]: event.target.value,
                        })
                      }
                    />
                  )}
                </label>
              ))}
            </div>

            {error && <p className="context-error">{error}</p>}
            {notice && <p className="context-notice">{notice}</p>}

            <footer className="context-form-actions">
              <button
                disabled={activeIndex === 0 || saving}
                onClick={() => {
                  setActiveIndex((current) => Math.max(0, current - 1));
                  setError("");
                  setNotice("");
                }}
              >
                Back
              </button>
              <div>
                <button disabled={saving} onClick={() => void saveSection(false)}>
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  className="primary"
                  disabled={saving}
                  onClick={() => void saveSection(true)}
                >
                  {activeIndex === CONTEXT_SECTIONS.length - 1
                    ? "Save and review"
                    : "Save and continue"}
                </button>
              </div>
            </footer>
          </div>
        )}
      </section>
    </main>
  );
}
