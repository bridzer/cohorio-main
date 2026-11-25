"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CONTEXT_SECTIONS } from "@/lib/marketing-context";
import "./review.css";

type Proposal = {
  section: string;
  field: string;
  source: string;
  sourceType: string;
  confidence: string;
  proposedValue: string | null;
  updatedAt: string;
};

type Gap = {
  section: string;
  sectionTitle: string;
  field: string;
  label: string;
  why: string;
  suggestion: { value: string; source: string } | null;
};

type BrainVersion = {
  id: string;
  version: number;
  note: string;
  createdAt: string;
};

function fieldLabel(section: string, field: string) {
  const definition = CONTEXT_SECTIONS.find((entry) => entry.id === section);
  const label = definition?.fields.find((entry) => entry.id === field)?.label;
  return `${definition?.title ?? section} › ${label ?? field}`;
}

export default function BrandBrainReviewPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [overall, setOverall] = useState(0);
  const [versions, setVersions] = useState<BrainVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState("");
  const [editValue, setEditValue] = useState("");
  const [gapDrafts, setGapDrafts] = useState<Record<string, string>>({});
  const [snapshotNote, setSnapshotNote] = useState("");

  const refresh = useCallback(async () => {
    const [proposalsResponse, gapsResponse, versionsResponse] = await Promise.all([
      fetch("/api/brand-brain/proposals", { cache: "no-store" }),
      fetch("/api/brand-brain/gaps", { cache: "no-store" }),
      fetch("/api/brand-brain/versions", { cache: "no-store" }),
    ]);
    const proposalsPayload = (await proposalsResponse.json()) as {
      proposals?: Proposal[];
      error?: string;
    };
    const gapsPayload = (await gapsResponse.json()) as {
      gaps?: Gap[];
      completeness?: { overall?: number };
      error?: string;
    };
    const versionsPayload = (await versionsResponse.json()) as {
      versions?: BrainVersion[];
      error?: string;
    };
    if (!proposalsResponse.ok) {
      throw new Error(proposalsPayload.error ?? "Unable to load suggestions.");
    }
    if (!gapsResponse.ok) {
      throw new Error(gapsPayload.error ?? "Unable to compute gaps.");
    }
    if (!versionsResponse.ok) {
      throw new Error(versionsPayload.error ?? "Unable to load versions.");
    }
    setProposals(proposalsPayload.proposals ?? []);
    setGaps(gapsPayload.gaps ?? []);
    setOverall(gapsPayload.completeness?.overall ?? 0);
    setVersions(versionsPayload.versions ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await refresh();
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load review.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  async function decide(
    proposal: Proposal,
    action: "approve" | "reject",
    value?: string,
  ) {
    const key = `${proposal.section}.${proposal.field}:${action}`;
    setBusy(key);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/brand-brain/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          section: proposal.section,
          field: proposal.field,
          ...(value !== undefined ? { value } : {}),
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to decide.");
      setEditing("");
      setNotice(
        action === "approve"
          ? `Approved ${fieldLabel(proposal.section, proposal.field)}.`
          : "Suggestion rejected.",
      );
      await refresh();
    } catch (decideError) {
      setError(decideError instanceof Error ? decideError.message : "Unable to decide.");
    } finally {
      setBusy("");
    }
  }

  async function saveGapDraft(gap: Gap) {
    const key = `${gap.section}.${gap.field}`;
    const value = gapDrafts[key]?.trim() ?? "";
    if (!value) {
      setError(`Write an answer for “${gap.label}” first.`);
      return;
    }
    setBusy(`gap:${key}`);
    setError("");
    setNotice("");
    try {
      const current = await fetch("/api/marketing-context", { cache: "no-store" });
      const payload = (await current.json()) as {
        context?: Record<string, Record<string, unknown>>;
        error?: string;
      };
      if (!current.ok) throw new Error(payload.error ?? "Unable to load context.");
      const base = { ...((payload.context?.[gap.section] ?? {}) as Record<string, unknown>) };
      base[gap.field] = value;
      const put = await fetch("/api/marketing-context", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId: gap.section, values: base }),
      });
      const saved = (await put.json()) as { error?: string };
      if (!put.ok) throw new Error(saved.error ?? "Unable to save answer.");
      setGapDrafts((drafts) => {
        const next = { ...drafts };
        delete next[key];
        return next;
      });
      setNotice(`Saved ${fieldLabel(gap.section, gap.field)}.`);
      await refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save answer.");
    } finally {
      setBusy("");
    }
  }

  async function synthesize() {
    setBusy("synthesize");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/brand-brain/synthesize", { method: "POST" });
      const payload = (await response.json()) as {
        proposed?: number;
        skipped?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Unable to run synthesis.");
      setNotice(
        payload.proposed
          ? `Proposed ${payload.proposed} value${payload.proposed === 1 ? "" : "s"} for review${payload.skipped ? ` (${payload.skipped} skipped)` : ""}.`
          : "Nothing new to propose — the Brain already covers the available evidence.",
      );
      await refresh();
    } catch (synthesisError) {
      setError(
        synthesisError instanceof Error ? synthesisError.message : "Unable to run synthesis.",
      );
    } finally {
      setBusy("");
    }
  }

  async function snapshot() {
    setBusy("snapshot");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/brand-brain/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "snapshot", note: snapshotNote }),
      });
      const payload = (await response.json()) as {
        version?: { version?: number };
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Unable to snapshot.");
      setSnapshotNote("");
      setNotice(`Saved version ${payload.version?.version ?? ""}.`);
      await refresh();
    } catch (snapshotError) {
      setError(snapshotError instanceof Error ? snapshotError.message : "Unable to snapshot.");
    } finally {
      setBusy("");
    }
  }

  async function restore(version: number) {
    if (
      !window.confirm(
        `Restore Brand Brain to version ${version}? Current values are snapshotted first, so nothing is lost.`,
      )
    ) {
      return;
    }
    setBusy(`restore:${version}`);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/brand-brain/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", version }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to restore.");
      setNotice(`Restored version ${version}. A safety snapshot was taken first.`);
      await refresh();
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Unable to restore.");
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return (
      <main className="review-loading">
        <div className="review-loading-mark">C</div>
        <p>Loading Brand Brain review…</p>
      </main>
    );
  }

  return (
    <main className="review-shell" id="main-content">
      <header className="review-header">
        <div>
          <Link href="/onboarding/brain" className="review-back">
            ← Brand Brain questionnaire
          </Link>
          <h1>Review Brand Brain</h1>
          <p>
            Approve evidence-backed suggestions, fill the gaps that matter, and
            snapshot before big changes. Nothing here publishes or sends anything.
          </p>
        </div>
        <div className="review-meter" role="status">
          <strong>{overall}%</strong>
          <span>required fields filled</span>
        </div>
      </header>

      {error && (
        <p className="review-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="review-notice" role="status">
          {notice}
        </p>
      )}

      <section aria-labelledby="review-suggestions">
        <div className="review-section-head">
          <div>
            <h2 id="review-suggestions">Suggestions awaiting review ({proposals.length})</h2>
            <p>Generated from onboarding answers and website analysis — never from guessing.</p>
          </div>
          <button
            type="button"
            disabled={busy === "synthesize"}
            onClick={() => void synthesize()}
          >
            {busy === "synthesize" ? "Running…" : "Generate suggestions"}
          </button>
        </div>
        {proposals.length === 0 ? (
          <p className="review-empty">Nothing pending. Run synthesis to look for new evidence.</p>
        ) : (
          <ul className="review-list">
            {proposals.map((proposal) => {
              const key = `${proposal.section}.${proposal.field}`;
              const isEditing = editing === key;
              return (
                <li key={key}>
                  <div className="review-item-head">
                    <strong>{fieldLabel(proposal.section, proposal.field)}</strong>
                    <span className="review-badges">
                      <em>{proposal.source}</em>
                      <em>{proposal.confidence}</em>
                    </span>
                  </div>
                  {isEditing ? (
                    <textarea
                      rows={3}
                      value={editValue}
                      onChange={(event) => setEditValue(event.target.value)}
                    />
                  ) : (
                    <p>{proposal.proposedValue}</p>
                  )}
                  <div className="review-item-actions">
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          className="primary"
                          disabled={busy === `${key}:approve`}
                          onClick={() => void decide(proposal, "approve", editValue)}
                        >
                          Save edited value
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditing("");
                            setEditValue("");
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="primary"
                          disabled={busy === `${key}:approve`}
                          onClick={() => void decide(proposal, "approve")}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(key);
                            setEditValue(proposal.proposedValue ?? "");
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="danger"
                          disabled={busy === `${key}:reject`}
                          onClick={() => void decide(proposal, "reject")}
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="review-gaps">
        <div className="review-section-head">
          <div>
            <h2 id="review-gaps">Information gaps ({gaps.length})</h2>
            <p>Required fields still empty, with why each one matters.</p>
          </div>
        </div>
        {gaps.length === 0 ? (
          <p className="review-empty">No gaps — every required field is filled.</p>
        ) : (
          <ul className="review-list">
            {gaps.map((gap) => {
              const key = `${gap.section}.${gap.field}`;
              return (
                <li key={key}>
                  <div className="review-item-head">
                    <strong>{fieldLabel(gap.section, gap.field)}</strong>
                  </div>
                  <p className="review-why">{gap.why}</p>
                  {gap.suggestion && (
                    <p className="review-suggestion">
                      Suggested from {gap.suggestion.source}: “{gap.suggestion.value}”
                    </p>
                  )}
                  <div className="review-gap-add">
                    <input
                      value={gapDrafts[key] ?? ""}
                      placeholder={
                        gap.suggestion
                          ? "Accept the suggestion above, or write your own"
                          : "Write the answer"
                      }
                      onChange={(event) =>
                        setGapDrafts((drafts) => ({ ...drafts, [key]: event.target.value }))
                      }
                    />
                    <button
                      type="button"
                      disabled={busy === `gap:${key}`}
                      onClick={() => {
                        if (gap.suggestion && !(gapDrafts[key]?.trim())) {
                          void decide(
                            {
                              section: gap.section,
                              field: gap.field,
                              source: gap.suggestion.source,
                              sourceType: "",
                              confidence: "",
                              proposedValue: gap.suggestion.value,
                              updatedAt: "",
                            },
                            "approve",
                          );
                        } else {
                          void saveGapDraft(gap);
                        }
                      }}
                    >
                      {gap.suggestion && !(gapDrafts[key]?.trim()) ? "Accept" : "Save"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="review-versions">
        <div className="review-section-head">
          <div>
            <h2 id="review-versions">Versions</h2>
            <p>Snapshots before synthesis runs and restores; last 20 kept.</p>
          </div>
        </div>
        <div className="review-snapshot-row">
          <input
            value={snapshotNote}
            maxLength={500}
            placeholder="Snapshot note (optional)"
            onChange={(event) => setSnapshotNote(event.target.value)}
          />
          <button type="button" disabled={busy === "snapshot"} onClick={() => void snapshot()}>
            {busy === "snapshot" ? "Saving…" : "Snapshot now"}
          </button>
        </div>
        {versions.length === 0 ? (
          <p className="review-empty">No versions yet. Snapshots appear here.</p>
        ) : (
          <ul className="review-list review-versions">
            {versions.map((entry) => (
              <li key={entry.id}>
                <span>
                  <strong>v{entry.version}</strong>
                  <small>
                    {new Date(entry.createdAt).toLocaleString()} ·{" "}
                    {entry.note || "No note"}
                  </small>
                </span>
                <button
                  type="button"
                  disabled={busy === `restore:${entry.version}`}
                  onClick={() => void restore(entry.version)}
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
