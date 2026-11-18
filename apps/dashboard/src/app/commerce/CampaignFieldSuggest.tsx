"use client";

import { useState } from "react";
import type { SuggestibleCampaignField } from "@/lib/shopify/campaign-suggestions";

type Suggestion = {
  field: SuggestibleCampaignField;
  value: string;
  reason: string;
  sources: string[];
};

/**
 * "Suggest from Brand Brain" affordance for one campaign brief field.
 * Fetches a grounded suggestion and lets the merchant apply or dismiss it —
 * values are never written into the brief without an explicit click.
 */
export default function CampaignFieldSuggest({
  field,
  connectionId,
  platform,
  objective,
  selectedProductIds,
  onApply,
}: {
  field: SuggestibleCampaignField;
  connectionId: string;
  platform: "meta" | "google" | "tiktok";
  objective: string;
  selectedProductIds: string[];
  onApply: (value: string) => void;
}) {
  const [phase, setPhase] = useState<
    "idle" | "loading" | "suggested" | "empty" | "error"
  >("idle");
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [brandBrainEmpty, setBrandBrainEmpty] = useState(false);
  const [message, setMessage] = useState("");

  async function suggest() {
    setPhase("loading");
    setMessage("");
    try {
      const response = await fetch(
        `/api/shopify/connections/${connectionId}/campaign-suggestions`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            field,
            platform,
            objective,
            productIds: selectedProductIds,
          }),
        },
      );
      const payload = (await response.json()) as {
        suggestion?: Suggestion | null;
        brandBrainEmpty?: boolean;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Unable to suggest a value.");
      }
      setBrandBrainEmpty(Boolean(payload.brandBrainEmpty));
      if (payload.suggestion) {
        setSuggestion(payload.suggestion);
        setPhase("suggested");
      } else {
        setSuggestion(null);
        setPhase("empty");
      }
    } catch (suggestError) {
      setMessage(
        suggestError instanceof Error
          ? suggestError.message
          : "Unable to suggest a value.",
      );
      setPhase("error");
    }
  }

  function apply() {
    if (suggestion) onApply(suggestion.value);
    setPhase("idle");
    setSuggestion(null);
  }

  function dismiss() {
    setPhase("idle");
    setSuggestion(null);
  }

  return (
    <span className="commerce-suggest">
      <button
        type="button"
        className="commerce-suggest-button"
        disabled={phase === "loading"}
        onClick={() => void suggest()}
        title="Suggest the best option from Brand Brain"
      >
        {phase === "loading" ? "Suggesting…" : "✦ Suggest"}
      </button>
      {phase === "suggested" && suggestion ? (
        <span className="commerce-suggestion" role="status">
          <strong>Cohorio suggestion</strong>
          <p>{suggestion.value}</p>
          <small>
            {suggestion.reason}{" "}
            {suggestion.sources.length
              ? `Sources: ${suggestion.sources.join(", ")}.`
              : null}
          </small>
          <span className="commerce-suggestion-actions">
            <button type="button" onClick={apply}>
              Use suggestion
            </button>
            <button type="button" onClick={dismiss}>
              Dismiss
            </button>
          </span>
        </span>
      ) : null}
      {phase === "empty" ? (
        <small className="commerce-suggest-note">
          {brandBrainEmpty ? (
            <>
              No Brand Brain context yet.{" "}
              <a href="/onboarding">Complete setup</a> to unlock suggestions.
            </>
          ) : (
            <>
              Brand Brain doesn&apos;t cover this yet — add it in{" "}
              <a href="/onboarding">Brand Brain setup</a>.
            </>
          )}
        </small>
      ) : null}
      {phase === "error" ? (
        <small className="commerce-suggest-note commerce-suggest-error">
          {message}
        </small>
      ) : null}
    </span>
  );
}
