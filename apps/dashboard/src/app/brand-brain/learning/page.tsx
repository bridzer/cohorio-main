"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type LearningStatus = "CANDIDATE" | "ACTIVE" | "NEEDS_REVIEW" | "SUPERSEDED" | "REJECTED";
type LearningScope = "TASK" | "USER" | "BRAND" | "ORGANIZATION";
type LearningCategory =
  | "BUSINESS_KNOWLEDGE"
  | "BRAND_KNOWLEDGE"
  | "USER_PREFERENCE"
  | "STRATEGIC_LEARNING"
  | "OPERATIONAL_LEARNING"
  | "PERFORMANCE_LEARNING";

type Memory = {
  id: string;
  category: LearningCategory;
  subject: string;
  learnedValue: unknown;
  confidence: number;
  evidenceCount: number;
  scope: LearningScope;
  status: LearningStatus;
  updatedAt: string;
  lastObservedAt: string;
};

type Insight = {
  id: string;
  title: string;
  detail: string;
  category: LearningCategory;
  subject: string;
  confidence: number;
  evidenceCount: number;
  scope: LearningScope;
  status: LearningStatus;
  updatedAt: string;
};

type Conflict = {
  id: string;
  existingValue: unknown;
  incomingValue: unknown;
  conflictType: string;
  status: string;
  createdAt: string;
};

type HistoryEntry = {
  id: string;
  memoryId: string;
  version: number;
  snapshot: Memory & { changeNote?: string; previousStatus?: string };
  changeNote: string;
  createdAt: string;
};

type InsightsResponse = {
  insights: {
    learned: Insight[];
    suggested: Memory[];
    conflicts: Conflict[];
    performance: Array<{
      metric: string;
      value: number;
      channel?: string | null;
      sourceProvider: string;
      insight?: string | null;
      isCorrelation: boolean;
      recordedAt: string;
    }>;
    recommendation: { insight: string; recommendation: string; confidenceNote: string } | null;
  };
  counts: {
    events: number;
    memoriesByStatus: Record<string, number>;
    openConflicts: number;
    evaluations: number;
    performanceSignals: number;
  };
};

function valueToText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "—";
  try {
    return JSON.stringify(value, null, 1).slice(0, 600);
  } catch {
    return String(value);
  }
}

function categoryLabel(c: LearningCategory): string {
  const map: Record<LearningCategory, string> = {
    BUSINESS_KNOWLEDGE: "Business",
    BRAND_KNOWLEDGE: "Brand",
    USER_PREFERENCE: "Preference",
    STRATEGIC_LEARNING: "Strategy",
    OPERATIONAL_LEARNING: "Workflow",
    PERFORMANCE_LEARNING: "Performance",
  };
  return map[c] ?? c;
}

function confidenceBadge(n: number): string {
  if (n >= 0.75) return "high";
  if (n >= 0.45) return "medium";
  return "low";
}

function scopeBadge(s: LearningScope) {
  const color: Record<LearningScope, string> = {
    USER: "#6366f1",
    BRAND: "#059669",
    ORGANIZATION: "#dc2626",
    TASK: "#6b7280",
  };
  return color[s] ?? "#6b7280";
}

export default function BrandBrainLearningPage() {
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"learned" | "suggested" | "conflicts" | "performance" | "history">("learned");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [insightsRes, historyRes] = await Promise.all([
        fetch("/api/brand-brain/learning/insights", { cache: "no-store" }),
        fetch("/api/brand-brain/learning/history?limit=60", { cache: "no-store" }),
      ]);
      if (!insightsRes.ok) {
        const body = (await insightsRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Unable to load learning insights.");
      }
      const insightsJson = (await insightsRes.json()) as InsightsResponse;
      setData(insightsJson);
      if (historyRes.ok) {
        const hj = (await historyRes.json()) as { history: HistoryEntry[] };
        setHistory(hj.history ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  async function actOnMemory(id: string, action: string, extra?: Record<string, unknown>) {
    setBusyId(id);
    setNotice(null);
    try {
      const res = await fetch(`/api/brand-brain/learning/memories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(extra ?? {}) }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; memory?: Memory };
      if (!res.ok) throw new Error(body.error ?? `Unable to ${action}.`);
      setNotice(`Updated: ${action} applied.`);
      await fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function resolveConflict(id: string, decision: "keep_existing" | "accept_incoming" | "dismiss") {
    setBusyId(id);
    setNotice(null);
    try {
      const res = await fetch("/api/brand-brain/learning/conflicts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conflictId: id, decision }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Unable to resolve conflict.");
      setNotice(`Conflict resolved: ${decision.replace("_", " ")}.`);
      await fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Resolution failed.");
    } finally {
      setBusyId(null);
    }
  }

  const stats = useMemo(() => {
    if (!data) return null;
    return data.counts;
  }, [data]);

  if (loading) {
    return (
      <main style={{ maxWidth: 980, margin: "0 auto", padding: "32px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "#e5e7eb", animation: "pulse 1.5s infinite" }} />
          <div>
            <div style={{ width: 220, height: 16, borderRadius: 6, background: "#e5e7eb" }} />
            <div style={{ width: 320, height: 12, borderRadius: 6, background: "#f3f4f6", marginTop: 8 }} />
          </div>
        </div>
        <div style={{ marginTop: 24, display: "grid", gap: 12 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ height: 96, borderRadius: 14, background: "#f9fafb", border: "1px solid #e5e7eb" }} />
          ))}
        </div>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "32px 20px" }}>
      <header style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              background: "linear-gradient(135deg, #111827 0%, #4f46e5 100%)",
              display: "grid",
              placeItems: "center",
              color: "#fff",
              fontWeight: 800,
            }}
          >
            B
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.3 }}>Brand Brain Learning Insights</h1>
            <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 13 }}>
              What Brand Brain has learned from your corrections, approvals, and results — reviewed before it changes your brand.
            </p>
          </div>
        </div>
      </header>

      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 10, marginBottom: 18 }}>
          <Stat label="Events captured" value={stats.events} hint="Observe → Capture" />
          <Stat label="Active learnings" value={stats.memoriesByStatus["ACTIVE"] ?? 0} hint="Apply to future AI" />
          <Stat label="Candidates" value={(stats.memoriesByStatus["CANDIDATE"] ?? 0) + (stats.memoriesByStatus["NEEDS_REVIEW"] ?? 0)} hint="Awaiting review" />
          <Stat label="Conflicts" value={stats.openConflicts} tone={stats.openConflicts ? "amber" : "neutral"} />
          <Stat label="Evaluations" value={stats.evaluations} />
        </div>
      )}

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", padding: "10px 12px", borderRadius: 10, fontSize: 13, marginBottom: 14 }}>
          {error} <button onClick={() => void fetchAll()} style={linkBtn}>Retry</button>
        </div>
      )}
      {notice && (
        <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46", padding: "10px 12px", borderRadius: 10, fontSize: 13, marginBottom: 14 }}>
          {notice}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {[
          { id: "learned", label: `What was learned (${data?.insights.learned.length ?? 0})` },
          { id: "suggested", label: `Suggested (${data?.insights.suggested.length ?? 0})` },
          { id: "conflicts", label: `Conflicts (${data?.insights.conflicts.length ?? 0})` },
          { id: "performance", label: "Performance" },
          { id: "history", label: "History" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: activeTab === tab.id ? "1px solid #111827" : "1px solid #e5e7eb",
              background: activeTab === tab.id ? "#111827" : "#fff",
              color: activeTab === tab.id ? "#fff" : "#374151",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
        <button onClick={() => void fetchAll()} style={{ marginLeft: "auto", ...pillBtnMuted }}>↻ Refresh</button>
      </div>

      {activeTab === "learned" && (
        <section>
          {(!data || data.insights.learned.length === 0) ? (
            <Empty title="No confirmed learnings yet" detail="As you correct Brand Brain, approve content, and generate work, learnings with clear provenance will appear here. Explicit preferences are learned right away; repeated patterns become candidates for your review." />
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {data.insights.learned.map((insight) => (
                <article key={insight.id} style={card}>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={categoryPill}>{categoryLabel(insight.category as LearningCategory)}</span>
                    <span style={{ ...scopePill, background: scopeBadge(insight.scope) }}>{insight.scope}</span>
                    <span style={{ marginLeft: "auto", ...confPill(insight.confidence) }}>{confidenceBadge(insight.confidence)} · {(insight.confidence * 100).toFixed(0)}% · {insight.evidenceCount} evidence</span>
                  </div>
                  <h3 style={{ margin: "10px 0 6px", fontSize: 15, fontWeight: 700 }}>{insight.title}</h3>
                  <p style={{ margin: 0, color: "#4b5563", fontSize: 13, lineHeight: 1.5 }}>{insight.detail || "—"}</p>
                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button disabled={busyId === insight.id} onClick={() => void actOnMemory(insight.id, "deactivate")} style={pillBtnMuted}>Deactivate</button>
                    <span style={{ marginLeft: "auto", color: "#9ca3af", fontSize: 12 }}>Updated {new Date(insight.updatedAt).toLocaleDateString()}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "suggested" && (
        <section>
          {(!data || data.insights.suggested.length === 0) ? (
            <Empty title="No suggestions right now" detail="When you repeatedly make the same kind of edit — like shortening captions or removing promotional claims — Brand Brain will suggest that preference here. Each suggestion shows the evidence and asks for your approval. We do not convert isolated edits into permanent preferences." />
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {data.insights.suggested.map((m) => (
                <article key={m.id} style={{ ...card, border: "1px solid #fbbf24", background: "#fffbeb" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={categoryPill}>{categoryLabel(m.category)}</span>
                    <span style={{ ...scopePill, background: scopeBadge(m.scope) }}>{m.scope}</span>
                    <span style={{ ...confPill(m.confidence) }}>{confidenceBadge(m.confidence)} · {(m.confidence * 100).toFixed(0)}% · {m.evidenceCount} evidence</span>
                    <span style={{ marginLeft: "auto", fontSize: 12, color: "#92400e", background: "#fef3c7", padding: "2px 8px", borderRadius: 999 }}>
                      {m.status === "NEEDS_REVIEW" ? "Needs review" : "Candidate"}
                    </span>
                  </div>
                  <h3 style={{ margin: "10px 0 6px", fontSize: 15, fontWeight: 700 }}>{m.subject}</h3>
                  <div style={{ background: "#fff", border: "1px solid #fde68a", borderRadius: 10, padding: "10px 12px", fontSize: 13, color: "#1f2937" }}>
                    We noticed you {previewSuggestedNotice(m)}
                  </div>
                  <p style={{ margin: "10px 0 0", color: "#374151", fontSize: 13, lineHeight: 1.5 }}>{valueToText(m.learnedValue)}</p>

                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button disabled={busyId === m.id} onClick={() => void actOnMemory(m.id, "confirm")} style={primaryBtn}>
                      {busyId === m.id ? "…" : "Confirm"}
                    </button>
                    <button disabled={busyId === m.id} onClick={() => void actOnMemory(m.id, "reject")} style={pillBtnMuted}>Reject</button>
                    <button disabled={busyId === m.id} onClick={() => void actOnMemory(m.id, "make_temporary")} style={pillBtnMuted}>This task only</button>
                    <button disabled={busyId === m.id} onClick={() => void actOnMemory(m.id, "apply_to_user")} style={pillBtnMuted}>Apply to me</button>
                    {m.scope !== "ORGANIZATION" && (
                      <button disabled={busyId === m.id} onClick={() => void actOnMemory(m.id, "apply_to_organization")} style={pillBtnMuted}>Apply to org</button>
                    )}
                  </div>

                  <details style={{ marginTop: 10 }}>
                    <summary style={{ cursor: "pointer", fontSize: 13, color: "#4b5563", fontWeight: 600 }}>Review evidence &amp; edit</summary>
                    <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                      <label style={{ fontSize: 12, color: "#6b7280", fontWeight: 600 }}>Supporting events: {m.evidenceCount}</label>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 600 }}>Edit learned value</span>
                        <textarea
                          value={editDraft[m.id] ?? valueToText(m.learnedValue)}
                          onChange={(e) => setEditDraft((cur) => ({ ...cur, [m.id]: e.target.value }))}
                          rows={3}
                          style={{ width: "100%", borderRadius: 10, border: "1px solid #e5e7eb", padding: "10px 12px", fontSize: 13 }}
                        />
                      </label>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          disabled={busyId === m.id}
                          onClick={() =>
                            void actOnMemory(m.id, "edit", {
                              learnedValue: editDraft[m.id] ?? valueToText(m.learnedValue),
                              subject: m.subject,
                            })
                          }
                          style={pillBtn}
                        >
                          Save edit
                        </button>
                        <button
                          disabled={busyId === m.id}
                          onClick={() => void actOnMemory(m.id, "confirm", { confidence: 0.85 })}
                          style={pillBtnMuted}
                        >
                          Confirm with high confidence
                        </button>
                      </div>
                    </div>
                  </details>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "conflicts" && (
        <section>
          {(!data || data.insights.conflicts.length === 0) ? (
            <Empty title="No knowledge conflicts" detail="When new feedback contradicts approved Brand Brain knowledge, it appears here instead of silently overwriting anything. You decide which value persists — the previous approved value stays until you approve a change." />
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {data.insights.conflicts.map((c) => (
                <article key={c.id} style={{ ...card, border: "1px solid #fca5a5", background: "#fef2f2" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ ...categoryPill, background: "#991b1b" }}>{c.conflictType}</span>
                    <span style={{ fontSize: 12, color: "#7f1d1d" }}>{new Date(c.createdAt).toLocaleString()}</span>
                    <span style={{ marginLeft: "auto", fontSize: 12, color: "#991b1b", fontWeight: 700 }}>{c.status}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 }}>
                    <div style={{ background: "#fff", border: "1px solid #fecaca", borderRadius: 10, padding: 12 }}>
                      <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase" }}>Previously approved</div>
                      <div style={{ marginTop: 6, fontSize: 13, color: "#1f2937", whiteSpace: "pre-wrap" }}>{valueToText(c.existingValue)}</div>
                    </div>
                    <div style={{ background: "#fff", border: "1px solid #fbbf24", borderRadius: 10, padding: 12 }}>
                      <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase" }}>New incoming</div>
                      <div style={{ marginTop: 6, fontSize: 13, color: "#1f2937", whiteSpace: "pre-wrap" }}>{valueToText(c.incomingValue)}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button disabled={busyId === c.id} onClick={() => void resolveConflict(c.id, "keep_existing")} style={primaryBtn}>
                      Keep approved value
                    </button>
                    <button disabled={busyId === c.id} onClick={() => void resolveConflict(c.id, "accept_incoming")} style={pillBtn}>
                      Accept incoming
                    </button>
                    <button disabled={busyId === c.id} onClick={() => void resolveConflict(c.id, "dismiss")} style={pillBtnMuted}>
                      Dismiss
                    </button>
                  </div>
                  <p style={{ margin: "8px 0 0", fontSize: 12, color: "#7f1d1d" }}>
                    Never silently overwrites verified brand information — requires your approval (§6.D).
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "performance" && (
        <section>
          {!data?.insights.recommendation && (data?.insights.performance.length ?? 0) === 0 ? (
            <Empty title="No performance insights yet" detail="Connect an authorized analytics integration (GA4, Shopify, etc.) and record outcomes. Insights here distinguish correlation from causation and will not automatically change brand identity based on short-term marketing results." />
          ) : data ? (
            <div style={{ display: "grid", gap: 12 }}>
              {data.insights.recommendation && (
                <article style={{ ...card, border: "1px solid #a7f3d0", background: "#ecfdf5" }}>
                  <div style={{ fontSize: 11, color: "#065f46", fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase" }}>Evidence-based recommendation</div>
                  <p style={{ margin: "8px 0 6px", fontSize: 14, fontWeight: 700, color: "#065f46" }}>{data.insights.recommendation.insight}</p>
                  <p style={{ margin: 0, fontSize: 13, color: "#047857" }}>{data.insights.recommendation.recommendation}</p>
                  <p style={{ margin: "10px 0 0", fontSize: 12, color: "#065f46", background: "#d1fae5", padding: "8px 10px", borderRadius: 8 }}>
                    {data.insights.recommendation.confidenceNote}
                  </p>
                </article>
              )}
              {(data?.insights.performance ?? []).map((s) => (
                <article key={`${s.sourceProvider}:${s.metric}:${s.recordedAt}`} style={card}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ ...categoryPill, background: "#0ea5e9" }}>{s.sourceProvider}</span>
                    <span style={{ ...scopePill, background: "#111827" }}>{s.channel ?? "overall"}</span>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>{s.metric}: {s.value}</span>
                    <span style={{ marginLeft: "auto", fontSize: 12, color: s.isCorrelation ? "#a16207" : "#065f46", background: s.isCorrelation ? "#fef9c3" : "#dcfce7", padding: "2px 8px", borderRadius: 999, fontWeight: 700 }}>
                      {s.isCorrelation ? "correlation" : "attributed"}
                    </span>
                  </div>
                  {s.insight && <p style={{ margin: "8px 0 0", fontSize: 13, color: "#374151" }}>{s.insight}</p>}
                  <div style={{ marginTop: 6, fontSize: 12, color: "#9ca3af" }}>{new Date(s.recordedAt).toLocaleString()}</div>
                </article>
              ))}
              <p style={{ fontSize: 12, color: "#6b7280", background: "#f9fafb", padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                Performance learning improves recommendations and experimentation — it does not blindly optimize for engagement or rewrite brand identity without approval (§9).
              </p>
            </div>
          ) : null}
        </section>
      )}

      {activeTab === "history" && (
        <section>
          {history.length === 0 ? (
            <Empty title="No history yet" detail="Every confirmed, edited, or superseded learning creates an audit entry here — what was learned, when, from which interaction, and how confident the system is (§11). History is per-workspace, with provenance preserved." />
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {history.map((h) => (
                <article key={h.id} style={{ ...card, padding: "14px 14px" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#4f46e5" }}>v{h.version}</span>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>{new Date(h.createdAt).toLocaleString()}</span>
                    <span style={{ ...scopePill, background: scopeBadge(h.snapshot?.scope ?? "BRAND") }}>{h.snapshot?.scope ?? "—"}</span>
                    {h.snapshot?.status && <span style={categoryPill}>{h.snapshot.status}</span>}
                    <span style={{ marginLeft: "auto", fontSize: 12, color: "#6b7280" }}>{h.snapshot?.subject ?? ""}</span>
                  </div>
                  <p style={{ margin: "8px 0 0", fontSize: 13, color: "#1f2937", fontWeight: 600 }}>{h.changeNote}</p>
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: "#4b5563" }}>{valueToText(h.snapshot?.learnedValue)}</p>
                  {h.snapshot?.status && h.snapshot?.status !== "ACTIVE" && (
                    <span style={{ display: "inline-block", marginTop: 8, fontSize: 11, color: "#6b7280", background: "#f3f4f6", padding: "2px 8px", borderRadius: 999 }}>
                      from {h.snapshot.previousStatus ?? "—"} → {h.snapshot.status}
                    </span>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      <footer style={{ marginTop: 28, padding: 14, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12, fontSize: 12, color: "#6b7280", lineHeight: 1.6 }}>
        <strong style={{ color: "#111827" }}>How learning works:</strong> Cohorio Intelligence coordinates interpretation using existing AI orchestration; Brand Brain remains the authoritative owner of persistent brand knowledge.
        <br />
        Single edits stay low-confidence and task-scoped — repeated approvals build confidence. Conflicts never overwrite verified facts without your approval. Performance signals are correlations unless proven otherwise.
        <br />
        <span style={{ color: "#9ca3af" }}>Isolated per organization &amp; workspace · User preferences are private · All changes are versioned</span>
      </footer>
    </main>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: "amber" | "neutral" }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase" }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 22, fontWeight: 800, color: tone === "amber" && value ? "#d97706" : "#111827" }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: "#9ca3af" }}>{hint}</div>}
    </div>
  );
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div style={{ background: "#fff", border: "1px dashed #d1d5db", borderRadius: 12, padding: 24, textAlign: "center" }}>
      <div style={{ fontWeight: 700, color: "#111827" }}>{title}</div>
      <p style={{ margin: "8px auto 0", maxWidth: 640, fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>{detail}</p>
    </div>
  );
}

function previewSuggestedNotice(m: Memory): string {
  const v = valueToText(m.learnedValue).toLowerCase();
  if (v.includes("short")) return "regularly shorten generated captions — would you like us to adopt a more concise writing style?";
  if (v.includes("concise") || v.includes("short")) return "regularly prefer concise content — adopt a shorter default length?";
  if (v.includes("professional") || v.includes("conversational")) return "frequently choose a professional but conversational tone.";
  return `use "${valueToText(m.learnedValue).slice(0, 80)}" — would you like us to adopt this as a preference?`;
}

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 16,
};

const categoryPill: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 0.3,
  textTransform: "uppercase",
  color: "#fff",
  background: "#111827",
  padding: "3px 8px",
  borderRadius: 999,
};

const scopePill: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#fff",
  padding: "3px 8px",
  borderRadius: 999,
};

const pillBtn: React.CSSProperties = {
  padding: "7px 12px",
  borderRadius: 999,
  border: "1px solid #111827",
  background: "#fff",
  color: "#111827",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const pillBtnMuted: React.CSSProperties = {
  padding: "7px 12px",
  borderRadius: 999,
  border: "1px solid #e5e7eb",
  background: "#f9fafb",
  color: "#374151",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const primaryBtn: React.CSSProperties = {
  padding: "7px 14px",
  borderRadius: 999,
  border: "1px solid #111827",
  background: "#111827",
  color: "#fff",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const linkBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#4f46e5",
  fontWeight: 700,
  cursor: "pointer",
  textDecoration: "underline",
};

function confPill(n: number): React.CSSProperties {
  const level = confidenceBadge(n);
  const bg = level === "high" ? "#dcfce7" : level === "medium" ? "#fef9c3" : "#f3f4f6";
  const fg = level === "high" ? "#166534" : level === "medium" ? "#854d0e" : "#374151";
  return { fontSize: 12, color: fg, background: bg, padding: "3px 8px", borderRadius: 999, fontWeight: 700, border: "1px solid #e5e7eb" };
}
