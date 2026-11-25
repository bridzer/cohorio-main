"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CONTEXT_SECTIONS } from "@/lib/marketing-context";
import "./review.css";
import "./assessment.css";

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

type DimensionAssessment = {
  dimension: string;
  label: string;
  status: string;
  confidence: string;
  completeness: number;
  evidence: { label: string; source: string; tier: string; stale: boolean }[];
  source: string;
  explanation: string;
  gaps: string[];
  nextAction: string;
  assessedAt: string;
};

type Recommendation = {
  id: string;
  dedupeKey: string;
  section: string | null;
  title: string;
  description: string;
  evidence: string[];
  why: string;
  solution: string;
  outcome: string;
  priority: string;
  confidence: string;
  effort: string;
  workflow: Record<string, unknown>;
  status: string;
  createdAt: string;
  updatedAt: string;
};

function fieldLabel(section: string, field: string) {
  const definition = CONTEXT_SECTIONS.find((entry) => entry.id === section);
  const label = definition?.fields.find((entry) => entry.id === field)?.label;
  return `${definition?.title ?? section} › ${label ?? field}`;
}

export default function BrandBrainReviewPage() {
  const router = useRouter();
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
  const [editingRecId, setEditingRecId] = useState("");
  const [recDraft, setRecDraft] = useState<{
    title: string;
    description: string;
    solution: string;
    priority: string;
  }>({ title: "", description: "", solution: "", priority: "medium" });
  const [gapDrafts, setGapDrafts] = useState<Record<string, string>>({});
  const [snapshotNote, setSnapshotNote] = useState("");
  const [assessment, setAssessment] = useState<DimensionAssessment[]>([]);
  const [assessmentOverallStats, setAssessmentOverallStats] = useState<{
    completeness: number;
    confidence: string;
  } | null>(null);
  const [assessed, setAssessed] = useState(false);
  const [recs, setRecs] = useState<Recommendation[]>([]);

  const refresh = useCallback(async () => {
    const [proposalsResponse, gapsResponse, versionsResponse, assessmentResponse, recsResponse] =
      await Promise.all([
        fetch("/api/brand-brain/proposals", { cache: "no-store" }),
        fetch("/api/brand-brain/gaps", { cache: "no-store" }),
        fetch("/api/brand-brain/versions", { cache: "no-store" }),
        fetch("/api/brand-brain/assessment", { cache: "no-store" }),
        fetch("/api/brand-brain/recommendations", { cache: "no-store" }),
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
    const assessmentPayload = (await assessmentResponse.json()) as {
      assessment?: DimensionAssessment[];
      overall?: { completeness?: number; confidence?: string };
      assessed?: boolean;
      error?: string;
    };
    const recsPayload = (await recsResponse.json()) as {
      recommendations?: Recommendation[];
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
    if (!assessmentResponse.ok) {
      throw new Error(assessmentPayload.error ?? "Unable to load assessment.");
    }
    if (!recsResponse.ok) {
      throw new Error(recsPayload.error ?? "Unable to load recommendations.");
    }
    setProposals(proposalsPayload.proposals ?? []);
    setGaps(gapsPayload.gaps ?? []);
    setOverall(gapsPayload.completeness?.overall ?? 0);
    setVersions(versionsPayload.versions ?? []);
    setAssessment(assessmentPayload.assessment ?? []);
    setAssessmentOverallStats(
      assessmentPayload.overall?.completeness !== undefined
        ? {
            completeness: assessmentPayload.overall.completeness,
            confidence: assessmentPayload.overall.confidence ?? "low",
          }
        : null,
    );
    setAssessed(Boolean(assessmentPayload.assessed));
    setRecs(recsPayload.recommendations ?? []);
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

  async function runAssessment() {
    setBusy("assess");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/brand-brain/assessment", { method: "POST" });
      const payload = (await response.json()) as {
        overall?: { completeness?: number; confidence?: string };
        recommendations?: { proposed?: number; skipped?: number };
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Unable to run assessment.");
      setNotice(
        `Assessment complete: ${payload.overall?.completeness ?? 0}% complete, ` +
          `${payload.overall?.confidence ?? "unknown"} confidence. ` +
          `${payload.recommendations?.proposed ?? 0} recommendation(s) created.`,
      );
      await refresh();
    } catch (assessError) {
      setError(assessError instanceof Error ? assessError.message : "Unable to run assessment.");
    } finally {
      setBusy("");
    }
  }

  async function actOnRecommendation(id: string, action: string) {
    setBusy(`rec:${id}:${action}`);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/brand-brain/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to update recommendation.");
      setNotice("Recommendation updated.");
      await refresh();
    } catch (recError) {
      setError(recError instanceof Error ? recError.message : "Unable to update recommendation.");
    } finally {
      setBusy("");
    }
  }

  async function saveRecommendationEdit(id: string) {
    setBusy(`rec:${id}:edit`);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/brand-brain/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "edit", id, ...recDraft }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to save recommendation.");
      setEditingRecId("");
      setNotice("Recommendation edited.");
      await refresh();
    } catch (recError) {
      setError(recError instanceof Error ? recError.message : "Unable to edit recommendation.");
    } finally {
      setBusy("");
    }
  }

  async function launchRecommendationWorkflow(rec: Recommendation) {
    const workflow = rec.workflow;
    if (rec.status === "NEW" || rec.status === "REVIEW_REQUIRED" || rec.status === "DEFERRED") {
      await actOnRecommendation(rec.id, "accept");
      await actOnRecommendation(rec.id, "start");
    } else if (rec.status === "ACCEPTED") {
      await actOnRecommendation(rec.id, "start");
    }
    switch (workflow.kind) {
      case "answer-fields":
        router.push("/onboarding/brain");
        break;
      case "upload-assets":
      case "run-analysis":
        router.push("/onboarding");
        break;
      case "connect-provider":
        router.push("/connections");
        break;
      default:
        break;
    }
  }

  function workflowLabel(workflow: Record<string, unknown>) {
    switch (workflow.kind) {
      case "answer-fields": {
        const fields = Array.isArray(workflow.fields) ? workflow.fields.join(", ") : "";
        return `Answer in Brand Brain › ${String(workflow.section ?? "")}: ${fields}`;
      }
      case "upload-assets":
        return "Upload brand assets in onboarding";
      case "run-analysis":
        return "Run website analysis in onboarding";
      case "connect-provider":
        return `Connect ${String(workflow.provider ?? "the integration")}`;
      default:
        return "Review and act";
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

      <section aria-labelledby="review-assessment">
        <div className="review-section-head">
          <div>
            <h2 id="review-assessment">Brand assessment</h2>
            <p>
              Completeness and evidence confidence, kept separate by design.
              {assessmentOverallStats
                ? ` Overall: ${assessmentOverallStats.completeness}% complete · ${assessmentOverallStats.confidence} confidence.`
                : ""}
            </p>
          </div>
          <button
            type="button"
            disabled={busy === "assess"}
            onClick={() => void runAssessment()}
          >
            {busy === "assess" ? "Assessing…" : assessed ? "Re-run assessment" : "Run assessment"}
          </button>
        </div>
        {!assessed && assessment.length === 0 ? (
          <p className="review-empty">
            No assessment yet. Run it to score all twelve Brand Brain dimensions.
          </p>
        ) : (
          <ul className="review-list assess-list">
            {assessment.map((dimension) => (
              <li key={dimension.dimension}>
                <div className="review-item-head">
                  <strong>{dimension.label}</strong>
                  <span className="review-badges">
                    <em className={`st-${dimension.status}`}>{dimension.status.replace("_", " ")}</em>
                    <em>{dimension.confidence} confidence</em>
                    <em>{dimension.completeness}%</em>
                  </span>
                </div>
                <div className="assess-track" aria-hidden="true">
                  <span style={{ width: `${dimension.completeness}%` }} />
                </div>
                <p className="review-muted">{dimension.explanation}</p>
                {dimension.evidence.length > 0 && (
                  <p className="review-muted">
                    Evidence: {dimension.evidence.map((item) => item.label).join("; ")}
                  </p>
                )}
                {dimension.nextAction && (
                  <p className="review-next">Next: {dimension.nextAction}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="review-recommendations">
        <div className="review-section-head">
          <div>
            <h2 id="review-recommendations">Brand improvement opportunities ({recs.length})</h2>
            <p>Created by assessments. Accept, start, complete, defer, or dismiss.</p>
          </div>
        </div>
        {recs.length === 0 ? (
          <p className="review-empty">
            Nothing open. Run an assessment to surface the next improvements.
          </p>
        ) : (
          <ul className="review-list">
            {recs.map((rec) => {
              const isEditingRec = editingRecId === rec.id;
              return (
              <li key={rec.id}>
                <div className="review-item-head">
                  <strong>{rec.title}</strong>
                  <span className="review-badges">
                    <em className={`pr-${rec.priority}`}>{rec.priority}</em>
                    <em>{rec.confidence} confidence</em>
                    <em>effort {rec.effort}</em>
                    <em>{rec.status.replace("_", " ")}</em>
                  </span>
                </div>
                {isEditingRec ? (
                  <div className="assess-rec-edit">
                    <input
                      value={recDraft.title}
                      placeholder="Problem title"
                      onChange={(event) =>
                        setRecDraft((current) => ({ ...current, title: event.target.value }))
                      }
                    />
                    <textarea
                      rows={2}
                      value={recDraft.description}
                      placeholder="Problem description"
                      onChange={(event) =>
                        setRecDraft((current) => ({ ...current, description: event.target.value }))
                      }
                    />
                    <textarea
                      rows={2}
                      value={recDraft.solution}
                      placeholder="Proposed solution"
                      onChange={(event) =>
                        setRecDraft((current) => ({ ...current, solution: event.target.value }))
                      }
                    />
                    <select
                      value={recDraft.priority}
                      onChange={(event) =>
                        setRecDraft((current) => ({ ...current, priority: event.target.value }))
                      }
                    >
                      <option value="high">high priority</option>
                      <option value="medium">medium priority</option>
                      <option value="low">low priority</option>
                    </select>
                  </div>
                ) : (
                  <>
                    <p>{rec.description}</p>
                    {rec.evidence.length > 0 && (
                      <p className="review-muted">
                        <strong>Evidence:</strong> {rec.evidence.slice(0, 3).join("; ")}
                      </p>
                    )}
                    <p className="review-muted">
                      <strong>Why:</strong> {rec.why}
                    </p>
                    <p className="review-muted">
                      <strong>Do:</strong> {rec.solution}
                    </p>
                    <p className="review-muted">
                      <strong>Outcome:</strong> {rec.outcome} · {workflowLabel(rec.workflow)}
                    </p>
                  </>
                )}
                <div className="review-item-actions">
                  {isEditingRec ? (
                    <>
                      <button
                        type="button"
                        className="primary"
                        disabled={busy === `rec:${rec.id}:edit`}
                        onClick={() => void saveRecommendationEdit(rec.id)}
                      >
                        Save changes
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingRecId("")}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="primary"
                        disabled={busy.startsWith(`rec:${rec.id}:`)}
                        onClick={() => void launchRecommendationWorkflow(rec)}
                      >
                        Implement
                      </button>
                      {(rec.status === "NEW" || rec.status === "REVIEW_REQUIRED" || rec.status === "DEFERRED") && (
                        <>
                          <button
                            type="button"
                            disabled={busy === `rec:${rec.id}:accept`}
                            onClick={() => void actOnRecommendation(rec.id, "accept")}
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            disabled={busy === `rec:${rec.id}:defer`}
                            onClick={() => void actOnRecommendation(rec.id, "defer")}
                          >
                            Defer
                          </button>
                        </>
                      )}
                      {rec.status === "ACCEPTED" && (
                        <button
                          type="button"
                          disabled={busy === `rec:${rec.id}:start`}
                          onClick={() => void actOnRecommendation(rec.id, "start")}
                        >
                          Start
                        </button>
                      )}
                      {rec.status === "IN_PROGRESS" && (
                        <button
                          type="button"
                          disabled={busy === `rec:${rec.id}:complete`}
                          onClick={() => void actOnRecommendation(rec.id, "complete")}
                        >
                          Complete
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingRecId(rec.id);
                          setRecDraft({
                            title: rec.title,
                            description: rec.description,
                            solution: rec.solution,
                            priority: rec.priority,
                          });
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busy === `rec:${rec.id}:dismiss`}
                        onClick={() => void actOnRecommendation(rec.id, "dismiss")}
                      >
                        Dismiss
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
