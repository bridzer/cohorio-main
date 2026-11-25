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

export function WebsiteAnalyzer({ websiteUrl }: { websiteUrl: string }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
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
        body: JSON.stringify({ websiteUrl }),
      });
      const payload = (await response.json()) as {
        analysis?: Analysis | null;
        error?: string;
      };
      if (!response.ok || !payload.analysis) {
        throw new Error(payload.error ?? "Unable to analyze this website.");
      }
      setAnalysis(payload.analysis);
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
        {busy ? "Analyzing website…" : analysis ? "Re-analyze website" : "Analyze website"}
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
          </div>
          {analysis.title && <strong>{analysis.title}</strong>}
          {analysis.description && <p>{analysis.description}</p>}
          {(analysis.emails.length > 0 || analysis.socials.length > 0) && (
            <p className="ob-dx-muted">
              {[
                analysis.emails.length ? `${analysis.emails.length} contact email(s)` : null,
                analysis.socials.length
                  ? `Social: ${analysis.socials.map((entry) => entry.network).join(", ")}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          {analysis.signals.length > 0 && (
            <p className="ob-dx-muted">Why: {analysis.signals.join("; ")}</p>
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
/* Adaptive discovery questions (Step 3, build path)                   */
/* ------------------------------------------------------------------ */

type DiscoveryQuestion = {
  id: string;
  label: string;
  hint: string;
  section: string;
  field: string;
};

const DISCOVERY_QUESTIONS: Record<string, DiscoveryQuestion[]> = {
  ecommerce: [
    { id: "products", label: "What products do you sell?", hint: "Name them plainly.", section: "productOverview", field: "whatItDoes" },
    { id: "customers", label: "Who are your ideal customers?", hint: "Who buys, and why them?", section: "targetAudience", field: "targetCompanies" },
    { id: "difference", label: "What makes your products different?", hint: "One honest edge.", section: "differentiation", field: "differentiators" },
    { id: "goal", label: "What should marketing achieve first?", hint: "One outcome.", section: "goals", field: "businessGoal" },
  ],
  "physical-retail": [
    { id: "products", label: "What do you sell?", hint: "Categories, not every SKU.", section: "productOverview", field: "whatItDoes" },
    { id: "customers", label: "Who are your customers?", hint: "Locals, visitors, regulars?", section: "targetAudience", field: "targetCompanies" },
    { id: "difference", label: "What makes your store different?", hint: "Why walk in?", section: "differentiation", field: "differentiators" },
    { id: "goal", label: "What should marketing achieve first?", hint: "One outcome.", section: "goals", field: "businessGoal" },
  ],
  "professional-services": [
    { id: "services", label: "What services do you provide?", hint: "Plain language.", section: "productOverview", field: "whatItDoes" },
    { id: "clients", label: "Who are your target clients?", hint: "Industry, size, role.", section: "targetAudience", field: "targetCompanies" },
    { id: "problems", label: "What problems do you solve?", hint: "Their words if you have them.", section: "problems", field: "coreProblem" },
    { id: "difference", label: "What makes your services different?", hint: "Method, proof, or focus.", section: "differentiation", field: "differentiators" },
  ],
  "consumer-services": [
    { id: "services", label: "What services do you offer?", hint: "Menu of services.", section: "productOverview", field: "whatItDoes" },
    { id: "customers", label: "Who are your customers?", hint: "Who books, and when?", section: "targetAudience", field: "targetCompanies" },
    { id: "difference", label: "What makes the experience different?", hint: "Moment of delight.", section: "differentiation", field: "differentiators" },
    { id: "goal", label: "What should marketing achieve first?", hint: "Bookings, visits, calls?", section: "goals", field: "businessGoal" },
  ],
  "media-content": [
    { id: "content", label: "What content do you create?", hint: "Formats and topics.", section: "productOverview", field: "whatItDoes" },
    { id: "audience", label: "Who is your audience?", hint: "Who subscribes or follows?", section: "targetAudience", field: "targetCompanies" },
    { id: "difference", label: "What makes your content different?", hint: "Voice, access, depth?", section: "differentiation", field: "differentiators" },
    { id: "goal", label: "What should marketing achieve first?", hint: "Subscribers, sponsors, sales?", section: "goals", field: "businessGoal" },
  ],
  "software-technology": [
    { id: "product", label: "What product or technology are you building?", hint: "What it does, simply.", section: "productOverview", field: "whatItDoes" },
    { id: "users", label: "Who are the intended users?", hint: "Role and company type.", section: "targetAudience", field: "targetCompanies" },
    { id: "problems", label: "What problems does it solve?", hint: "Cost of the status quo.", section: "problems", field: "coreProblem" },
    { id: "model", label: "What is the business model?", hint: "How customers buy.", section: "productOverview", field: "businessModel" },
  ],
  "civic-social": [
    { id: "services", label: "What services do you provide?", hint: "Programs and support.", section: "productOverview", field: "whatItDoes" },
    { id: "community", label: "Who is your community?", hint: "Who you serve.", section: "targetAudience", field: "targetCompanies" },
    { id: "difference", label: "What makes your approach different?", hint: "Trust, reach, method.", section: "differentiation", field: "differentiators" },
    { id: "goal", label: "What should marketing achieve first?", hint: "Awareness, donors, volunteers?", section: "goals", field: "businessGoal" },
  ],
};

const SECTION_TITLES: Record<string, string> = {
  productOverview: "Product overview",
  targetAudience: "Target audience",
  problems: "Problems",
  differentiation: "Differentiation",
  goals: "Goals",
};

export function DiscoveryQuestions({ categoryId }: { categoryId: string }) {
  const questions = DISCOVERY_QUESTIONS[categoryId] ?? [];
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/marketing-context", { cache: "no-store" });
        const payload = (await response.json()) as {
          context?: MarketingContext;
        };
        if (!response.ok || cancelled) return;
        const prefill: Record<string, string> = {};
        for (const question of questions) {
          const existing =
            payload.context?.[question.section as keyof MarketingContext]?.[question.field];
          if (typeof existing === "string" && existing.trim()) {
            prefill[question.id] = existing;
          }
        }
        if (!cancelled && Object.keys(prefill).length) setAnswers(prefill);
      } catch {
        // Prefill is a convenience; saving still merges server-side.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId]);

  async function save() {
    if (busy) return;
    setBusy(true);
    setNote("");
    setProblem("");
    try {
      const response = await fetch("/api/marketing-context", { cache: "no-store" });
      const payload = (await response.json()) as {
        context?: MarketingContext;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Unable to load context.");
      const context = payload.context ?? {};
      let saved = 0;
      let skipped = 0;
      const touched = new Set<string>();
      for (const question of questions) {
        const value = answers[question.id]?.trim() ?? "";
        if (!value) continue;
        const section = (context[question.section as keyof MarketingContext] ?? {}) as Record<
          string,
          unknown
        >;
        if (section._notApplicable === "true") {
          skipped += 1;
          continue;
        }
        const current = typeof section[question.field] === "string" ? (section[question.field] as string).trim() : "";
        if (current) {
          skipped += 1;
          continue;
        }
        touched.add(question.section);
      }
      for (const sectionId of touched) {
        const base = { ...((context[sectionId as keyof MarketingContext] ?? {}) as Record<string, unknown>) };
        for (const question of questions.filter((entry) => entry.section === sectionId)) {
          const value = answers[question.id]?.trim() ?? "";
          if (value) base[question.field] = value;
        }
        const put = await fetch("/api/marketing-context", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sectionId, values: base }),
        });
        if (!put.ok) {
          const failure = (await put.json()) as { error?: string };
          throw new Error(failure.error ?? "Unable to save answers.");
        }
        saved += questions.filter((entry) => entry.section === sectionId).length;
      }
      setNote(
        saved
          ? `${saved} answer${saved === 1 ? "" : "s"} saved to Brand Brain${skipped ? ` (${skipped} already filled, kept as-is)` : ""}.`
          : "Nothing new to save — answer a question above, or edit Brand Brain directly.",
      );
    } catch (saveError) {
      setProblem(saveError instanceof Error ? saveError.message : "Unable to save answers.");
    } finally {
      setBusy(false);
    }
  }

  if (!questions.length) return null;

  return (
    <div className="ob-dx">
      <h2 className="ob-subhead">Discovery questions</h2>
      <p className="ob-lead">
        Answers save into empty Brand Brain fields only — your existing wording is
        never overwritten.
      </p>
      {questions.map((question) => (
        <label key={question.id} className="ob-dx-field">
          <span>
            {question.label}
            <small>
              → Brand Brain › {SECTION_TITLES[question.section] ?? question.section}
            </small>
          </span>
          <textarea
            rows={2}
            value={answers[question.id] ?? ""}
            placeholder={question.hint}
            onChange={(event) =>
              setAnswers((current) => ({ ...current, [question.id]: event.target.value }))
            }
          />
        </label>
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
      <button type="button" className="ob-dx-button" disabled={busy} onClick={() => void save()}>
        {busy ? "Saving…" : "Save answers to Brand Brain"}
      </button>
    </div>
  );
}
