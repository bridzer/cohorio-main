"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import type { MarketingContext } from "@/lib/marketing-context";
import "./discovery.css";

/* ------------------------------------------------------------------ */
/* Shared small pieces                                                 */
/* ------------------------------------------------------------------ */

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/* ------------------------------------------------------------------ */
/* Website analyzer (Step 3, import path)                              */
/* ------------------------------------------------------------------ */

type Analysis = {
  url: string;
  platform: string;
  businessModel: string;
  confidence: "high" | "medium" | "low";
  title: string | null;
  description: string | null;
  emails: string[];
  phones: string[];
  socials: { network: string; url: string }[];
  headings: string[];
  signals: string[];
  industry?: string | null;
  inferredBusinessModel?: string | null;
  productsServices?: string[];
  messaging?: string[];
  targetAudiences?: string[];
  positioning?: string | null;
  voiceCharacteristics?: string[];
  marketingChannels?: string[];
  seoOpportunities?: string[];
  competitors?: string[];
  missingInfo?: string[];
  pagesCrawled?: string[];
  intelligenceSummary?: string | null;
};

type DiscoveryAssessmentSummary = {
  overall?: { completeness: number; confidence: string };
  recommendations?: { proposed: number; skipped: number };
};

const PLATFORM_LABELS: Record<string, string> = {
  shopify: "Shopify store",
  woocommerce: "WooCommerce",
  wix: "Wix",
  squarespace: "Squarespace",
  webflow: "Webflow",
  bigcommerce: "BigCommerce",
  magento: "Magento",
  custom: "Custom storefront",
  unknown: "Unknown platform",
};

const MODEL_LABELS: Record<string, string> = {
  "shopify-store": "Shopify storefront",
  ecommerce: "E-commerce",
  standalone: "Content / business site",
  unknown: "Unclassified",
};

export function WebsiteAnalyzer({
  websiteUrl,
  businessName,
}: {
  websiteUrl: string;
  businessName?: string;
}) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [assessmentSummary, setAssessmentSummary] =
    useState<DiscoveryAssessmentSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/brand-discovery/analyze", {
          cache: "no-store",
        });
        const payload = (await response.json()) as { analysis?: Analysis | null };
        if (!cancelled && response.ok && payload.analysis) {
          setAnalysis(payload.analysis);
        }
      } catch {
        // Analysis is advisory; a failed preload never blocks the step.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function run() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/brand-discovery/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteUrl, businessName }),
      });
      const payload = (await response.json()) as {
        analysis?: Analysis | null;
        overall?: { completeness: number; confidence: string };
        recommendations?: { proposed: number; skipped: number };
        error?: string;
      };
      if (!response.ok || !payload.analysis) {
        throw new Error(payload.error ?? "Unable to analyze this website.");
      }
      setAnalysis(payload.analysis);
      if (payload.overall) {
        setAssessmentSummary({
          overall: payload.overall,
          recommendations: payload.recommendations,
        });
      }
    } catch (runError) {
      setError(
        runError instanceof Error ? runError.message : "Unable to analyze this website.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ob-dx">
      <button
        type="button"
        className="ob-dx-button"
        disabled={busy || !websiteUrl.trim()}
        title={websiteUrl.trim() ? undefined : "Enter the website URL first"}
        onClick={() => void run()}
      >
        {busy
          ? "Analyzing website & assessing brand…"
          : analysis
            ? "Re-analyze website & assess"
            : "Analyze website & assess brand"}
      </button>
      {error && (
        <p className="ob-dx-error" role="alert">
          {error} You can continue without analysis and retry later.
        </p>
      )}
      {analysis && (
        <div className="ob-dx-card" role="status">
          <div className="ob-dx-badges">
            <span className="ob-dx-badge">
              {PLATFORM_LABELS[analysis.platform] ?? analysis.platform}
            </span>
            <span className="ob-dx-badge">
              {MODEL_LABELS[analysis.businessModel] ?? analysis.businessModel}
            </span>
            <span className={`ob-dx-badge tone-${analysis.confidence}`}>
              {analysis.confidence} confidence
            </span>
            {analysis.industry && (
              <span className="ob-dx-badge">{analysis.industry}</span>
            )}
          </div>
          {analysis.title && <strong>{analysis.title}</strong>}
          {analysis.intelligenceSummary ? (
            <p>{analysis.intelligenceSummary}</p>
          ) : (
            analysis.description && <p>{analysis.description}</p>
          )}
          {analysis.inferredBusinessModel && (
            <p className="ob-dx-muted">
              <strong>Business model:</strong> {analysis.inferredBusinessModel}
            </p>
          )}
          {Boolean(analysis.productsServices?.length) && (
            <p className="ob-dx-muted">
              <strong>Products / services:</strong>{" "}
              {analysis.productsServices!.slice(0, 5).join(", ")}
            </p>
          )}
          {Boolean(analysis.targetAudiences?.length) && (
            <p className="ob-dx-muted">
              <strong>Audience signals:</strong>{" "}
              {analysis.targetAudiences!.slice(0, 4).join(", ")}
            </p>
          )}
          {Boolean(analysis.voiceCharacteristics?.length) && (
            <p className="ob-dx-muted">
              <strong>Voice traits:</strong>{" "}
              {analysis.voiceCharacteristics!.slice(0, 4).join(", ")}
            </p>
          )}
          {(analysis.emails.length > 0 ||
            analysis.socials.length > 0 ||
            Boolean(analysis.marketingChannels?.length)) && (
            <p className="ob-dx-muted">
              {[
                analysis.emails.length ? `${analysis.emails.length} contact email(s)` : null,
                analysis.marketingChannels?.length
                  ? `Channels: ${analysis.marketingChannels.slice(0, 5).join(", ")}`
                  : analysis.socials.length
                    ? `Social: ${analysis.socials.map((entry) => entry.network).join(", ")}`
                    : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          {Boolean(analysis.seoOpportunities?.length) && (
            <p className="ob-dx-muted">
              <strong>SEO opportunities ({analysis.seoOpportunities!.length}):</strong>{" "}
              {analysis.seoOpportunities!.slice(0, 2).join(" ")}
            </p>
          )}
          {Boolean(analysis.missingInfo?.length) && (
            <p className="ob-dx-muted">
              <strong>Missing / unverified:</strong>{" "}
              {analysis.missingInfo!.slice(0, 2).join(" ")}
            </p>
          )}
          {analysis.signals.length > 0 && (
            <p className="ob-dx-muted">Signals: {analysis.signals.join("; ")}</p>
          )}
          {assessmentSummary?.overall && (
            <p className="ob-dx-note">
              Brand Assessment updated: {assessmentSummary.overall.completeness}% complete ·{" "}
              {assessmentSummary.overall.confidence} evidence confidence ·{" "}
              {assessmentSummary.recommendations?.proposed ?? 0} opportunity(ies) queued.{" "}
              <a href="/onboarding/brain/review">Inspect full assessment</a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Asset uploader (Step 3, both paths)                                 */
/* ------------------------------------------------------------------ */

type AssetMeta = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  hasText: boolean;
  createdAt: string;
};

export function AssetUploader() {
  const [assets, setAssets] = useState<AssetMeta[]>([]);
  const [accepted, setAccepted] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/brand-assets", { cache: "no-store" });
        const payload = (await response.json()) as {
          assets?: AssetMeta[];
          accepted?: string[];
        };
        if (!cancelled && response.ok) {
          setAssets(payload.assets ?? []);
          setAccepted(payload.accepted ?? []);
        }
      } catch {
        // Uploads are optional; a failed preload never blocks the step.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files ? [...event.target.files] : [];
    event.target.value = "";
    if (!files.length || busy) return;
    setBusy(true);
    setProblems([]);
    setNotice("");
    try {
      const form = new FormData();
      for (const file of files) form.append("files", file);
      const response = await fetch("/api/brand-assets", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as {
        assets?: AssetMeta[];
        rejected?: { filename: string; reason: string }[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Upload failed.");
      setAssets((current) => [...(payload.assets ?? []), ...current]);
      const rejected = payload.rejected ?? [];
      setProblems(rejected.map((entry) => `${entry.filename}: ${entry.reason}`));
      if (payload.assets?.length) {
        setNotice(
          `${payload.assets.length} file${payload.assets.length === 1 ? "" : "s"} stored. ` +
            "Text and catalogs become Brand Brain source material; other formats are kept for the document pipeline.",
        );
      }
    } catch (uploadError) {
      setProblems([
        uploadError instanceof Error ? uploadError.message : "Upload failed.",
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      const response = await fetch("/api/brand-assets", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) throw new Error("Delete failed.");
      setAssets((current) => current.filter((asset) => asset.id !== id));
    } catch {
      setProblems(["Couldn't delete that file. Retry shortly."]);
    }
  }

  return (
    <div className="ob-dx">
      <h2 className="ob-subhead">Brand assets <span className="ob-dx-optional">Optional</span></h2>
      <p className="ob-lead">
        Logos, photos, catalogs, PDFs, and documents ground future research.
        {accepted.length > 0 && ` Accepted: ${accepted.join(", ")} (max 8 MB each).`}
      </p>
      <label className="ob-dx-upload">
        <input
          type="file"
          multiple
          disabled={busy}
          accept={accepted.join(",")}
          onChange={(event) => void upload(event)}
        />
        <span>{busy ? "Uploading…" : "Choose files to upload"}</span>
      </label>
      {notice && (
        <p className="ob-dx-note" role="status">
          {notice}
        </p>
      )}
      {problems.map((problem) => (
        <p key={problem} className="ob-dx-error" role="alert">
          {problem}
        </p>
      ))}
      {assets.length > 0 && (
        <ul className="ob-dx-assets">
          {assets.map((asset) => (
            <li key={asset.id}>
              <span>
                <strong>{asset.filename}</strong>
                <small>
                  {fileSize(asset.sizeBytes)} ·{" "}
                  {asset.hasText ? "text ready" : "stored"}
                </small>
              </span>
              <button type="button" onClick={() => void remove(asset.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Adaptive discovery questions (Step 3, build path) — Milestone 2     */
/* Uses /api/brand-brain/discovery to load mode-annotated questions.    */
/* ------------------------------------------------------------------ */

type DiscoveryAnswerMode = "autofill" | "suggestion" | "placeholder";

type DiscoveryQuestionItem = {
  id: string;
  label: string;
  section: string;
  field: string;
  sectionTitle: string;
  multiline: boolean;
  alreadyConfirmed: boolean;
  confirmedValue: string | null;
  mode: DiscoveryAnswerMode;
  suggestedValue: string;
  source: string | null;
  sourceType: string | null;
  confidence: string | null;
  verificationStatus: string;
  reasoning: string | null;
  evidence: string[];
  placeholderExample: string;
  usefulHint: string;
};

type QuestionState = {
  value: string;
  action: "accept" | "edit" | "reject" | "skip" | "pending";
};

const MODE_BADGES: Record<DiscoveryAnswerMode, { label: string; className: string }> = {
  autofill: { label: "Auto-filled", className: "ob-dx-mode-badge mode-autofill" },
  suggestion: { label: "AI suggestion", className: "ob-dx-mode-badge mode-suggestion" },
  placeholder: { label: "Your answer needed", className: "ob-dx-mode-badge mode-placeholder" },
};

function DiscoveryQuestionCard({
  question,
  state,
  onChange,
}: {
  question: DiscoveryQuestionItem;
  state: QuestionState;
  onChange: (next: QuestionState) => void;
}) {
  if (question.alreadyConfirmed) {
    return (
      <div className="ob-dx-field ob-dx-confirmed">
        <span>
          {question.label}
          <small>
            → Brand Brain › {question.sectionTitle}
          </small>
        </span>
        <div className="ob-dx-confirmed-value">
          <span className="ob-dx-mode-badge mode-confirmed">✓ Confirmed</span>
          <p>{question.confirmedValue}</p>
        </div>
      </div>
    );
  }

  const badge = MODE_BADGES[question.mode];
  const hasValue = question.mode !== "placeholder";
  const displayValue = state.action === "pending" && hasValue
    ? question.suggestedValue
    : state.value;
  const isDecided = state.action !== "pending";

  return (
    <div className="ob-dx-field">
      <span>
        {question.label}
        <small>
          → Brand Brain › {question.sectionTitle}
        </small>
      </span>
      <div className="ob-dx-question-meta">
        <span className={badge.className}>{badge.label}</span>
        {question.source && (
          <span className="ob-dx-source-label">
            From: {question.source}
            {question.confidence && ` · ${question.confidence} confidence`}
          </span>
        )}
      </div>
      {question.reasoning && (
        <p className="ob-dx-reasoning">{question.reasoning}</p>
      )}
      {question.evidence.length > 0 && (
        <details className="ob-dx-evidence">
          <summary>Evidence ({question.evidence.length})</summary>
          <ul>
            {question.evidence.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </details>
      )}
      <textarea
        rows={question.multiline ? 3 : 2}
        value={displayValue}
        placeholder={question.placeholderExample}
        onChange={(event) =>
          onChange({ value: event.target.value, action: "edit" })
        }
      />
      <p className="ob-dx-hint">{question.usefulHint}</p>
      {hasValue && (
        <div className="ob-dx-actions">
          <button
            type="button"
            className={`ob-dx-action-btn${state.action === "accept" ? " active" : ""}`}
            disabled={isDecided && state.action !== "accept"}
            onClick={() => onChange({ value: question.suggestedValue, action: "accept" })}
          >
            ✓ Accept
          </button>
          <button
            type="button"
            className={`ob-dx-action-btn${state.action === "reject" ? " active" : ""}`}
            disabled={isDecided && state.action !== "reject"}
            onClick={() => onChange({ value: "", action: "reject" })}
          >
            ✕ Reject
          </button>
          <button
            type="button"
            className={`ob-dx-action-btn${state.action === "skip" ? " active" : ""}`}
            disabled={isDecided && state.action !== "skip"}
            onClick={() => onChange({ value: "", action: "skip" })}
          >
            Skip
          </button>
          {isDecided && (
            <button
              type="button"
              className="ob-dx-action-btn"
              onClick={() => onChange({ value: question.suggestedValue, action: "pending" })}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function DiscoveryQuestions({ categoryId }: { categoryId: string }) {
  const [questions, setQuestions] = useState<DiscoveryQuestionItem[]>([]);
  const [states, setStates] = useState<Record<string, QuestionState>>({});
  const [sourcesUsed, setSourcesUsed] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setQuestions([]);
    setStates({});
    setNote("");
    setProblem("");
    setLoaded(false);
    void (async () => {
      try {
        const response = await fetch(
          `/api/brand-brain/discovery?categoryId=${encodeURIComponent(categoryId)}`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as {
          questions?: DiscoveryQuestionItem[];
          sourcesUsed?: string[];
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok) {
          setProblem(payload.error ?? "Unable to load discovery questions.");
          return;
        }
        const items = payload.questions ?? [];
        setQuestions(items);
        setSourcesUsed(payload.sourcesUsed ?? []);
        const initial: Record<string, QuestionState> = {};
        for (const q of items) {
          if (q.alreadyConfirmed) continue;
          initial[q.id] = {
            value: q.suggestedValue || "",
            action: "pending",
          };
        }
        setStates(initial);
        setLoaded(true);
      } catch {
        if (!cancelled) {
          setProblem("Unable to load discovery questions. Continue manually.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [categoryId]);

  function updateState(id: string, next: QuestionState) {
    setStates((current) => ({ ...current, [id]: next }));
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setNote("");
    setProblem("");
    try {
      const answers = questions
        .filter((q) => !q.alreadyConfirmed)
        .map((q) => {
          const st = states[q.id];
          const action = st?.action === "pending"
            ? (q.mode === "placeholder" ? "skip" : "accept")
            : st?.action ?? "skip";
          return {
            questionId: q.id,
            section: q.section,
            field: q.field,
            value: action === "reject" || action === "skip"
              ? ""
              : (st?.value ?? q.suggestedValue ?? "").trim(),
            action,
            source: q.source,
          };
        });
      const response = await fetch("/api/brand-brain/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId, answers }),
      });
      const result = (await response.json()) as {
        savedCount?: number;
        rejectedCount?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "Unable to save answers.");
      const saved = result.savedCount ?? 0;
      const rejected = result.rejectedCount ?? 0;
      const parts: string[] = [];
      if (saved) parts.push(`${saved} answer${saved === 1 ? "" : "s"} saved to Brand Brain`);
      if (rejected) parts.push(`${rejected} rejected`);
      setNote(
        parts.length
          ? `${parts.join(", ")}.`
          : "Nothing new to save — answer a question above or edit Brand Brain directly.",
      );
    } catch (saveError) {
      setProblem(saveError instanceof Error ? saveError.message : "Unable to save answers.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="ob-dx">
        <p className="ob-dx-muted">Loading intelligent discovery questions…</p>
      </div>
    );
  }

  if (!questions.length && !problem) return null;

  const confirmedCount = questions.filter((q) => q.alreadyConfirmed).length;
  const activeQuestions = questions.filter((q) => !q.alreadyConfirmed);

  return (
    <div className="ob-dx">
      <h2 className="ob-subhead">Discovery questions</h2>
      <p className="ob-lead">
        {loaded && sourcesUsed.length > 0 && (
          <>
            Sources analyzed: {sourcesUsed.slice(0, 3).join(", ")}
            {sourcesUsed.length > 3 && ` + ${sourcesUsed.length - 3} more`}.{" "}
          </>
        )}
        Pre-filled answers are marked — review, edit, or reject each one.
        {confirmedCount > 0 && (
          <> <strong>{confirmedCount} field{confirmedCount === 1 ? "" : "s"}</strong> already confirmed.</>
        )}
      </p>
      {confirmedCount > 0 && (
        <details className="ob-dx-confirmed-section">
          <summary className="ob-dx-muted">
            Show {confirmedCount} confirmed field{confirmedCount === 1 ? "" : "s"}
          </summary>
          {questions
            .filter((q) => q.alreadyConfirmed)
            .map((q) => (
              <DiscoveryQuestionCard
                key={q.id}
                question={q}
                state={{ value: q.confirmedValue ?? "", action: "accept" }}
                onChange={() => undefined}
              />
            ))}
        </details>
      )}
      {activeQuestions.map((question) => (
        <DiscoveryQuestionCard
          key={question.id}
          question={question}
          state={states[question.id] ?? { value: "", action: "pending" }}
          onChange={(next) => updateState(question.id, next)}
        />
      ))}
      {note && (
        <p className="ob-dx-note" role="status">
          {note}
        </p>
      )}
      {problem && (
        <p className="ob-dx-error" role="alert">
          {problem}
        </p>
      )}
      {activeQuestions.length > 0 && (
        <button
          type="button"
          className="ob-dx-button"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save answers to Brand Brain"}
        </button>
      )}
    </div>
  );
}
