"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import "./approval-center.css";
import "./approval-center.css";

type Proposal = {
  section: string;
  field: string;
  source: string;
  sourceType: string;
  confidence: string;
  proposedValue: string | null;
  updatedAt: string;
};

type Recommendation = {
  id: string;
  title: string;
  description: string;
  why: string;
  solution: string;
  outcome: string;
  priority: string;
  confidence: string;
  effort: string;
  workflow: Record<string, unknown>;
  status: string;
  evidence: string[];
};

type CompletionJob = {
  id: string;
  status: string;
  updatedAt: string;
  result?: Record<string, unknown>;
};

type Gap = {
  section: string;
  sectionTitle: string;
  field: string;
  label: string;
};

type Version = {
  version: number;
  note: string;
  createdAt: string;
};

function priorityClass(priority: string) {
  if (priority === "high") return "prio-high";
  if (priority === "low") return "prio-low";
  return "prio-medium";
}

export default function BrandBrainApprovalCenter() {
  const router = useRouter();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [overall, setOverall] = useState<{ overall: number; sections: { id: string; title: string; percent: number }[] } | null>(null);
  const [assessmentOverall, setAssessmentOverall] = useState<{ completeness: number; confidence: string } | null>(null);
  const [completionJob, setCompletionJob] = useState<CompletionJob | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [editingProposal, setEditingProposal] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [propRes, recRes, gapsRes, assessRes, compRes, verRes] = await Promise.all([
        fetch("/api/brand-brain/proposals", { cache: "no-store" }),
        fetch("/api/brand-brain/recommendations", { cache: "no-store" }),
        fetch("/api/brand-brain/gaps", { cache: "no-store" }),
        fetch("/api/brand-brain/assessment", { cache: "no-store" }),
        fetch("/api/brand-brain/completion", { cache: "no-store" }),
        fetch("/api/brand-brain/versions", { cache: "no-store" }),
      ]);
      const propJson = (await propRes.json()) as { proposals?: Proposal[] };
      const recJson = (await recRes.json()) as { recommendations?: Recommendation[] };
      const gapsJson = (await gapsRes.json()) as { gaps?: Gap[]; completeness?: typeof overall };
      const assessJson = (await assessRes.json()) as { overall?: typeof assessmentOverall; assessment?: unknown[] };
      const compJson = (await compRes.json()) as { job?: CompletionJob; pendingReviews?: number };
      const verJson = (await verRes.json()) as { versions?: Version[] };
      if (propRes.ok) setProposals(propJson.proposals ?? []);
      if (recRes.ok) setRecommendations(recJson.recommendations ?? []);
      if (gapsRes.ok) {
        setGaps(gapsJson.gaps ?? []);
        if (gapsJson.completeness) setOverall(gapsJson.completeness as never);
      }
      if (assessRes.ok && assessJson.overall) setAssessmentOverall(assessJson.overall);
      if (compRes.ok) setCompletionJob(compJson.job ?? null);
      if (verRes.ok) setVersions((verJson.versions ?? []).slice(0, 3));
    } catch {
      // approval center hides silently on fetch failure; dashboard remains usable
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function approveProposal(p: Proposal, value?: string) {
    const key = `${p.section}.${p.field}:approve`;
    setBusy(key);
    setError("");
    try {
      const res = await fetch("/api/brand-brain/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", section: p.section, field: p.field, ...(value !== undefined ? { value } : {}) }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Unable to approve.");
      setNotice(`Approved ${p.section}.${p.field}`);
      setEditingProposal(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to approve.");
    } finally {
      setBusy("");
    }
  }

  async function rejectProposal(p: Proposal) {
    const key = `${p.section}.${p.field}:reject`;
    setBusy(key);
    setError("");
    try {
      const res = await fetch("/api/brand-brain/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", section: p.section, field: p.field }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Unable to reject.");
      setNotice("Suggestion rejected.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to reject.");
    } finally {
      setBusy("");
    }
  }

  async function actOnRecommendation(id: string, action: string) {
    setBusy(`rec:${id}:${action}`);
    setError("");
    try {
      const res = await fetch("/api/brand-brain/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Unable to update recommendation.");
      setNotice(`Recommendation ${action}ed.`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update recommendation.");
    } finally {
      setBusy("");
    }
  }

  async function triggerCompletion() {
    setBusy("completion");
    setError("");
    try {
      const res = await fetch("/api/brand-brain/completion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger: "dashboard" }),
      });
      const payload = (await res.json()) as { error?: string; metrics?: { provisionalSaved?: number } };
      if (!res.ok) throw new Error(payload.error ?? "Unable to run completion.");
      setNotice(payload.metrics?.provisionalSaved ? `Completion queued ${payload.metrics.provisionalSaved} suggestion(s) for review.` : "Completion checked — nothing new to propose.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to run completion.");
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return (
      <section className="approval-center" aria-busy="true">
        <div className="approval-skeleton">Loading Brand Brain status…</div>
      </section>
    );
  }

  const sectionsNeedingReview = overall?.sections.filter((s) => s.percent < 100) ?? [];
  const pendingCount = proposals.length;
  const hasJobRunning = completionJob && ["QUEUED", "ANALYZING", "GENERATING"].includes(completionJob.status);

  return (
    <section className="approval-center" aria-label="Brand Brain Approval Center">
      {error && <p className="approval-error" role="alert">{error}</p>}
      {notice && <p className="approval-notice" role="status">{notice}</p>}

      {/* A. Brand Brain Progress */}
      <div className="approval-grid">
        <div className="approval-card progress-card">
          <div className="approval-card-head">
            <h2>Brand Brain Progress</h2>
            <span className="approval-badge">{overall ? `${overall.overall}% complete` : "—"}</span>
          </div>
          <div className="approval-progress-main">
            <div className="approval-progress-circle" aria-hidden="true" style={{ ["--pct" as never]: `${overall?.overall ?? 0}%` } as never}>
              <span>{overall?.overall ?? 0}%</span>
            </div>
            <div className="approval-progress-meta">
              <p>
                {assessmentOverall ? (
                  <><strong>{assessmentOverall.completeness}%</strong> assessed · <strong>{assessmentOverall.confidence}</strong> confidence</>
                ) : (
                  <><strong>{overall?.overall ?? 0}%</strong> required fields filled</>
                )}
              </p>
              <p className="muted">{pendingCount} pending approval{pendingCount === 1 ? "" : "s"} · {gaps.length} gap{gaps.length === 1 ? "" : "s"} remaining</p>
              {completionJob && (
                <p className="muted">Completion: <em className={`job-${completionJob.status.toLowerCase()}`}>{completionJob.status}</em> {hasJobRunning && "· updating…"}</p>
              )}
            </div>
          </div>
          {sectionsNeedingReview.length > 0 && (
            <div className="approval-sections">
              <h3>Sections needing review</h3>
              <ul>
                {sectionsNeedingReview.slice(0, 4).map((s) => (
                  <li key={s.id}>
                    <span>{s.title}</span>
                    <span className="section-pct">{s.percent}%</span>
                    <div className="section-bar"><span style={{ width: `${s.percent}%` }} /></div>
                  </li>
                ))}
              </ul>
              {sectionsNeedingReview.length > 4 && <small className="muted">+{sectionsNeedingReview.length - 4} more</small>}
            </div>
          )}
          {versions.length > 0 && (
            <div className="approval-versions">
              <h3>Recent updates</h3>
              <ul>
                {versions.map((v) => (
                  <li key={v.version}><span>v{v.version}</span> {v.note || "Snapshot"} <small>{new Date(v.createdAt).toLocaleDateString()}</small></li>
                ))}
              </ul>
            </div>
          )}
          <div className="approval-card-actions">
            <button type="button" onClick={triggerCompletion} disabled={busy === "completion" || Boolean(hasJobRunning)}>
              {busy === "completion" || hasJobRunning ? "Checking…" : "Run completion check"}
            </button>
            <button type="button" className="ghost" onClick={() => router.push("/onboarding/brain/review")}>Open review</button>
          </div>
        </div>

        {/* B. Pending Brand Brain Approvals */}
        <div className="approval-card approvals-card">
          <div className="approval-card-head">
            <h2>Pending Approvals</h2>
            {pendingCount > 0 && <span className="approval-badge warn">{pendingCount}</span>}
          </div>
          {pendingCount === 0 ? (
            <div className="approval-empty">
              <p>All clear — no pending approvals.</p>
              <small className="muted">New suggestions appear here when evidence is found.</small>
            </div>
          ) : (
            <ul className="approval-list">
              {proposals.slice(0, 4).map((p) => {
                const key = `${p.section}.${p.field}`;
                const isEditing = editingProposal === key;
                return (
                  <li key={key} className="approval-item">
                    <div className="approval-item-head">
                      <strong>{p.section} · {p.field}</strong>
                      <span className="approval-chip">{p.source} · {p.confidence}</span>
                    </div>
                    {isEditing ? (
                      <textarea value={editValue} onChange={(e) => setEditValue(e.target.value)} rows={3} />
                    ) : (
                      <p className="approval-value">{p.proposedValue}</p>
                    )}
                    <div className="approval-actions">
                      {isEditing ? (
                        <>
                          <button type="button" className="primary" disabled={busy === `${key}:approve`} onClick={() => void approveProposal(p, editValue)}>Save</button>
                          <button type="button" onClick={() => setEditingProposal(null)}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="primary" disabled={busy === `${key}:approve`} onClick={() => void approveProposal(p)}>Approve</button>
                          <button type="button" onClick={() => { setEditingProposal(key); setEditValue(p.proposedValue ?? ""); }}>Edit</button>
                          <button type="button" onClick={() => void rejectProposal(p)} disabled={busy === `${key}:reject`}>Reject</button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {pendingCount > 4 && <button type="button" className="approval-view-all" onClick={() => router.push("/onboarding/brain/review")}>View all {pendingCount} →</button>}
        </div>

        {/* C. Brand Improvement Opportunities */}
        <div className="approval-card opportunities-card">
          <div className="approval-card-head">
            <h2>Brand Improvement Opportunities</h2>
            {recommendations.length > 0 && <span className="approval-badge">{recommendations.length}</span>}
          </div>
          {recommendations.length === 0 ? (
            <div className="approval-empty">
              <p>No open improvements.</p>
              <small className="muted">Run a brand assessment to surface the next opportunities.</small>
            </div>
          ) : (
            <ul className="approval-list">
              {recommendations.slice(0, 3).map((r) => (
                <li key={r.id} className="approval-item">
                  <div className="approval-item-head">
                    <strong>{r.title}</strong>
                    <span className={`approval-chip ${priorityClass(r.priority)}`}>{r.priority} · {r.effort}</span>
                  </div>
                  <p className="approval-desc">{r.description}</p>
                  <p className="muted small"><strong>Do:</strong> {r.solution}</p>
                  <div className="approval-actions">
                    {r.status === "NEW" || r.status === "REVIEW_REQUIRED" || r.status === "DEFERRED" ? (
                      <>
                        <button type="button" className="primary" disabled={busy === `rec:${r.id}:accept`} onClick={() => void actOnRecommendation(r.id, "accept")}>Accept</button>
                        <button type="button" disabled={busy === `rec:${r.id}:defer`} onClick={() => void actOnRecommendation(r.id, "defer")}>Defer</button>
                      </>
                    ) : r.status === "ACCEPTED" ? (
                      <button type="button" className="primary" disabled={busy === `rec:${r.id}:start`} onClick={() => void actOnRecommendation(r.id, "start")}>Start</button>
                    ) : r.status === "IN_PROGRESS" ? (
                      <button type="button" className="primary" disabled={busy === `rec:${r.id}:complete`} onClick={() => void actOnRecommendation(r.id, "complete")}>Mark done</button>
                    ) : null}
                    <button type="button" onClick={() => router.push("/onboarding/brain/review")}>View details</button>
                    {(r.status !== "DISMISSED" && r.status !== "COMPLETED") && (
                      <button type="button" className="danger" disabled={busy === `rec:${r.id}:dismiss`} onClick={() => void actOnRecommendation(r.id, "dismiss")}>Dismiss</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {recommendations.length > 3 && <button type="button" className="approval-view-all" onClick={() => router.push("/onboarding/brain/review")}>View all opportunities →</button>}
        </div>
      </div>
    </section>
  );
}
