"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import "./campaign.css";

type Platform = "meta" | "google" | "tiktok";

type CatalogProduct = {
  id: string;
  title: string;
  productType: string | null;
  imageUrl: string | null;
  minimumPrice: number;
  currencyCode: string | null;
  revenue30d: number;
};

type Creative = {
  id: string;
  productId: string;
  productTitle: string;
  angle: "product" | "audience" | "offer";
  headline: string;
  primaryText: string;
  description: string;
  cta: string;
  landingPageUrl: string | null;
  imageUrl: string | null;
  visualBrief: string;
  limits: {
    headline: number;
    primaryText: number;
    description: number;
  };
  grounding: string[];
};

type Campaign = {
  id: string;
  name: string;
  platform: Platform;
  objective: string;
  status: "draft" | "ready" | "archived";
  dailyBudget: number;
  currencyCode: string;
  audience: string;
  valueProposition: string;
  offer: string | null;
  landingPageUrl: string | null;
  selectedProductIds: string[];
  strategy: {
    summary: string;
    structure: string[];
    budgetPlan: {
      testing: number;
      scaling: number;
      note: string;
    };
    testingPlan: string[];
    launchChecklist: string[];
  };
  creatives: Creative[];
  createdAt: string;
  updatedAt: string;
};

function platformName(platform: Platform) {
  return {
    meta: "Meta",
    google: "Google Ads",
    tiktok: "TikTok",
  }[platform];
}

const PUBLISH_PROVIDERS: Record<Platform, string> = {
  meta: "meta-ads",
  google: "google-ads",
  tiktok: "tiktok-ads",
};

function money(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function csvCell(value: string | number | null) {
  const normalized = value === null ? "" : String(value);
  return `"${normalized.replaceAll('"', '""')}"`;
}

export default function AdCampaignBuilder({
  connectionId,
  currencyCode,
}: {
  connectionId: string | null;
  currencyCode: string;
}) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [platform, setPlatform] = useState<Platform>("meta");
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("Sales");
  const [dailyBudget, setDailyBudget] = useState("50");
  const [audience, setAudience] = useState("");
  const [valueProposition, setValueProposition] = useState("");
  const [offer, setOffer] = useState("");
  const [landingPageUrl, setLandingPageUrl] = useState("");
  const [loading, setLoading] = useState(Boolean(connectionId));
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [connectedProviders, setConnectedProviders] = useState<Set<string>>(
    () => new Set(),
  );
  const [publishingId, setPublishingId] = useState("");
  const [publishNotice, setPublishNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/integrations", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { integrations?: { provider: string; configured: boolean }[] }) => {
        if (cancelled) return;
        setConnectedProviders(
          new Set(
            (payload.integrations ?? [])
              .filter((item) => item.configured)
              .map((item) => item.provider),
          ),
        );
      })
      .catch(() => {
        // Publish stays disabled until connection status loads.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!connectionId) return;
    let cancelled = false;
    Promise.all([
      fetch(`/api/shopify/connections/${connectionId}/products`, {
        cache: "no-store",
      }).then((response) => response.json()),
      fetch(`/api/shopify/connections/${connectionId}/campaigns`, {
        cache: "no-store",
      }).then((response) => response.json()),
    ])
      .then(
        ([
          productPayload,
          campaignPayload,
        ]: [
          { products?: CatalogProduct[]; error?: string },
          { campaigns?: Campaign[]; error?: string },
        ]) => {
          if (cancelled) return;
          if (!productPayload.products) {
            throw new Error(
              productPayload.error || "Unable to load Shopify products.",
            );
          }
          if (!campaignPayload.campaigns) {
            throw new Error(
              campaignPayload.error || "Unable to load campaign drafts.",
            );
          }
          setProducts(productPayload.products);
          setCampaigns(campaignPayload.campaigns);
          setSelectedCampaignId(campaignPayload.campaigns[0]?.id ?? "");
          setSelectedProductIds(
            productPayload.products[0]?.id
              ? [productPayload.products[0].id]
              : [],
          );
        },
      )
      .catch((reason) => {
        if (!cancelled) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load campaign builder.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connectionId]);

  const selectedCampaign =
    campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null;

  const selectedProducts = useMemo(
    () =>
      products.filter((product) => selectedProductIds.includes(product.id)),
    [products, selectedProductIds],
  );

  function toggleProduct(productId: string) {
    setSelectedProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : current.length < 10
          ? [...current, productId]
          : current,
    );
  }

  async function buildCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!connectionId) return;
    setGenerating(true);
    setError("");
    try {
      const response = await fetch(
        `/api/shopify/connections/${connectionId}/campaigns`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            platform,
            objective,
            dailyBudget: Number(dailyBudget),
            audience,
            valueProposition,
            offer,
            landingPageUrl,
            productIds: selectedProductIds,
          }),
        },
      );
      const payload = (await response.json()) as {
        campaign?: Campaign;
        error?: string;
      };
      if (!response.ok || !payload.campaign) {
        throw new Error(payload.error || "Unable to generate campaign.");
      }
      setCampaigns((current) => [payload.campaign!, ...current]);
      setSelectedCampaignId(payload.campaign.id);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to generate campaign.",
      );
    } finally {
      setGenerating(false);
    }
  }

  async function updateStatus(
    campaign: Campaign,
    status: Campaign["status"],
  ) {
    if (!connectionId) return;
    const response = await fetch(
      `/api/shopify/connections/${connectionId}/campaigns`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: campaign.id, status }),
      },
    );
    const payload = (await response.json()) as {
      campaign?: Campaign;
      error?: string;
    };
    if (!response.ok || !payload.campaign) {
      setError(payload.error || "Unable to update campaign.");
      return;
    }
    if (status === "archived") {
      setCampaigns((current) =>
        current.filter((item) => item.id !== campaign.id),
      );
      setSelectedCampaignId("");
      return;
    }
    setCampaigns((current) =>
      current.map((item) =>
        item.id === campaign.id ? payload.campaign! : item,
      ),
    );
  }

  async function publish(campaign: Campaign) {
    if (!connectionId) return;
    if (
      !window.confirm(
        `Send "${campaign.name}" to ${platformName(campaign.platform)} now? Review the creatives first.`,
      )
    ) {
      return;
    }
    setPublishingId(campaign.id);
    setPublishNotice("");
    setError("");
    try {
      const response = await fetch(
        `/api/shopify/connections/${connectionId}/campaigns/${campaign.id}/publish`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: true }),
        },
      );
      const payload = (await response.json()) as {
        campaign?: Campaign;
        error?: string;
      };
      if (!response.ok || !payload.campaign) {
        throw new Error(payload.error || "Unable to publish this campaign.");
      }
      setCampaigns((current) =>
        current.map((item) => (item.id === campaign.id ? payload.campaign! : item)),
      );
      setPublishNotice(`Sent to ${platformName(campaign.platform)}.`);
    } catch (publishError) {
      setError(
        publishError instanceof Error
          ? publishError.message
          : "Unable to publish this campaign.",
      );
    } finally {
      setPublishingId("");
    }
  }

  async function copyCreative(creative: Creative) {
    await navigator.clipboard.writeText(
      `${creative.headline}\n\n${creative.primaryText}\n\n${creative.description}\n${creative.landingPageUrl ?? ""}`,
    );
    setCopiedId(creative.id);
    window.setTimeout(() => setCopiedId(""), 1600);
  }

  function exportCampaign(campaign: Campaign) {
    const rows = [
      [
        "platform",
        "campaign",
        "product",
        "angle",
        "headline",
        "primary_text",
        "description",
        "cta",
        "landing_page_url",
        "visual_brief",
      ],
      ...campaign.creatives.map((creative) => [
        campaign.platform,
        campaign.name,
        creative.productTitle,
        creative.angle,
        creative.headline,
        creative.primaryText,
        creative.description,
        creative.cta,
        creative.landingPageUrl,
        creative.visualBrief,
      ]),
    ];
    const csv = rows
      .map((row) => row.map((value) => csvCell(value)).join(","))
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${campaign.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "campaign"}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (!connectionId) {
    return (
      <section className="commerce-campaign-empty">
        <span>Ad Campaign Builder</span>
        <h1>Connect Shopify to build product campaigns.</h1>
        <p>
          Campaign creative is grounded in selected catalog products and the
          audience, value proposition, and offer you provide.
        </p>
      </section>
    );
  }

  return (
    <section className="commerce-campaign-workspace">
      <div className="commerce-campaign-heading">
        <div>
          <span className="commerce-kicker">Ad Campaign Builder</span>
          <h1>Build campaigns from real product data.</h1>
          <p>
            Create platform-compliant draft creative for review and export.
            Cohorio never invents claims beyond your Shopify catalog and brief.
          </p>
        </div>
        <div className="commerce-campaign-platforms" aria-label="Ad platform">
          {(["meta", "google", "tiktok"] as Platform[]).map((item) => (
            <button
              key={item}
              className={platform === item ? "active" : ""}
              onClick={() => setPlatform(item)}
            >
              {platformName(item)}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="commerce-campaign-error">{error}</div>}
      {publishNotice && (
        <div className="commerce-campaign-notice" role="status">
          {publishNotice}
        </div>
      )}

      <div className="commerce-campaign-grid">
        <form className="commerce-campaign-brief" onSubmit={buildCampaign}>
          <div className="commerce-campaign-card-heading">
            <div>
              <span>Campaign brief</span>
              <h2>Ground the creative</h2>
            </div>
            <small>{platformName(platform)}</small>
          </div>

          <label>
            Campaign name
            <input
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              placeholder="Fall collection prospecting"
              required
            />
          </label>

          <div className="commerce-campaign-field-grid">
            <label>
              Objective
              <select
                value={objective}
                onChange={(event) => setObjective(event.target.value)}
              >
                <option>Sales</option>
                <option>Traffic</option>
                <option>Awareness</option>
              </select>
            </label>
            <label>
              Daily budget ({currencyCode})
              <input
                type="number"
                min="1"
                step="0.01"
                value={dailyBudget}
                onChange={(event) => setDailyBudget(event.target.value)}
                required
              />
            </label>
          </div>

          <label>
            Target audience
            <textarea
              rows={3}
              value={audience}
              maxLength={500}
              onChange={(event) => setAudience(event.target.value)}
              placeholder="Who should see this, and what do they care about?"
              required
            />
          </label>

          <label>
            Core value proposition
            <textarea
              rows={3}
              value={valueProposition}
              maxLength={1000}
              onChange={(event) => setValueProposition(event.target.value)}
              placeholder="The specific, supportable reason someone should buy"
              required
            />
          </label>

          <label>
            Offer <small>Optional—do not enter unapproved claims.</small>
            <input
              value={offer}
              maxLength={500}
              onChange={(event) => setOffer(event.target.value)}
              placeholder="Free shipping over $75"
            />
          </label>

          <label>
            Campaign landing page <small>Optional override</small>
            <input
              type="url"
              value={landingPageUrl}
              maxLength={2000}
              onChange={(event) => setLandingPageUrl(event.target.value)}
              placeholder="https://store.example.com/collections/fall"
            />
          </label>

          <fieldset>
            <legend>
              Products <small>{selectedProductIds.length}/10 selected</small>
            </legend>
            <div className="commerce-campaign-products">
              {loading && <p>Loading products...</p>}
              {!loading &&
                products.map((product) => (
                  <label key={product.id}>
                    <input
                      type="checkbox"
                      checked={selectedProductIds.includes(product.id)}
                      onChange={() => toggleProduct(product.id)}
                    />
                    <i
                      style={
                        product.imageUrl
                          ? {
                              backgroundImage: `url("${product.imageUrl}")`,
                            }
                          : undefined
                      }
                    >
                      {!product.imageUrl && product.title.charAt(0)}
                    </i>
                    <span>
                      <strong>{product.title}</strong>
                      <small>
                        {money(
                          product.minimumPrice,
                          product.currencyCode || currencyCode,
                        )}{" "}
                        · {money(product.revenue30d, currencyCode)} in 30d
                      </small>
                    </span>
                  </label>
                ))}
            </div>
          </fieldset>

          <button
            type="submit"
            disabled={
              generating ||
              !name.trim() ||
              !audience.trim() ||
              !valueProposition.trim() ||
              !selectedProductIds.length
            }
          >
            {generating
              ? "Building campaign..."
              : `Generate ${selectedProductIds.length * 3} creative drafts`}
          </button>
          <p className="commerce-campaign-disclaimer">
            Drafts require human review, conversion tracking, and connected ad
            accounts before launch.
          </p>
        </form>

        <div className="commerce-campaign-output">
          <div className="commerce-campaign-history">
            <div>
              <span>Campaign drafts</span>
              <small>{campaigns.length} active</small>
            </div>
            <div>
              {campaigns.map((campaign) => (
                <button
                  key={campaign.id}
                  className={
                    selectedCampaign?.id === campaign.id ? "active" : ""
                  }
                  onClick={() => setSelectedCampaignId(campaign.id)}
                >
                  <span className={`platform-${campaign.platform}`}>
                    {platformName(campaign.platform).charAt(0)}
                  </span>
                  <span>
                    <strong>{campaign.name}</strong>
                    <small>
                      {campaign.creatives.length} creatives ·{" "}
                      {campaign.status}
                    </small>
                  </span>
                </button>
              ))}
              {!campaigns.length && <p>No campaign drafts yet.</p>}
            </div>
          </div>

          {selectedCampaign ? (
            <div className="commerce-campaign-review">
              <div className="commerce-campaign-review-heading">
                <div>
                  <span>
                    {platformName(selectedCampaign.platform)} ·{" "}
                    {selectedCampaign.objective}
                  </span>
                  <h2>{selectedCampaign.name}</h2>
                  <p>{selectedCampaign.strategy.summary}</p>
                </div>
                <div>
                  <button onClick={() => exportCampaign(selectedCampaign)}>
                    Export CSV
                  </button>
                  <button
                    disabled={
                      publishingId === selectedCampaign.id ||
                      !connectedProviders.has(PUBLISH_PROVIDERS[selectedCampaign.platform])
                    }
                    title={
                      connectedProviders.has(PUBLISH_PROVIDERS[selectedCampaign.platform])
                        ? undefined
                        : `Connect ${platformName(selectedCampaign.platform)} in Settings`
                    }
                    onClick={() => void publish(selectedCampaign)}
                  >
                    {publishingId === selectedCampaign.id ? "Publishing..." : "Publish"}
                  </button>
                  <button
                    className="primary"
                    onClick={() =>
                      void updateStatus(
                        selectedCampaign,
                        selectedCampaign.status === "ready" ? "draft" : "ready",
                      )
                    }
                  >
                    {selectedCampaign.status === "ready"
                      ? "Return to draft"
                      : "Mark review-ready"}
                  </button>
                </div>
              </div>

              <div className="commerce-campaign-plan">
                <div>
                  <span>Daily budget</span>
                  <strong>
                    {money(
                      selectedCampaign.dailyBudget,
                      selectedCampaign.currencyCode,
                    )}
                  </strong>
                </div>
                <div>
                  <span>Creative tests</span>
                  <strong>{selectedCampaign.creatives.length}</strong>
                </div>
                <div>
                  <span>Testing allocation</span>
                  <strong>
                    {money(
                      selectedCampaign.strategy.budgetPlan.testing,
                      selectedCampaign.currencyCode,
                    )}
                  </strong>
                </div>
                <div>
                  <span>Scaling allocation</span>
                  <strong>
                    {money(
                      selectedCampaign.strategy.budgetPlan.scaling,
                      selectedCampaign.currencyCode,
                    )}
                  </strong>
                </div>
              </div>

              <div className="commerce-campaign-creatives">
                {selectedCampaign.creatives.map((creative) => (
                  <article key={creative.id}>
                    <div className="commerce-creative-preview">
                      <i
                        style={
                          creative.imageUrl
                            ? {
                                backgroundImage: `url("${creative.imageUrl}")`,
                              }
                            : undefined
                        }
                      >
                        {!creative.imageUrl && creative.productTitle.charAt(0)}
                      </i>
                      <span>{creative.angle} angle</span>
                    </div>
                    <div className="commerce-creative-copy">
                      <div>
                        <small>Headline</small>
                        <strong>{creative.headline}</strong>
                        <b>
                          {creative.headline.length}/{creative.limits.headline}
                        </b>
                      </div>
                      <div>
                        <small>Primary text</small>
                        <p>{creative.primaryText}</p>
                        <b>
                          {creative.primaryText.length}/
                          {creative.limits.primaryText}
                        </b>
                      </div>
                      <div>
                        <small>Description</small>
                        <p>{creative.description}</p>
                        <b>
                          {creative.description.length}/
                          {creative.limits.description}
                        </b>
                      </div>
                      <details>
                        <summary>Visual direction and grounding</summary>
                        <p>{creative.visualBrief}</p>
                        <ul>
                          {creative.grounding.map((source) => (
                            <li key={source}>{source}</li>
                          ))}
                        </ul>
                      </details>
                      <button onClick={() => void copyCreative(creative)}>
                        {copiedId === creative.id ? "Copied" : "Copy creative"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <div className="commerce-campaign-checklist">
                <div>
                  <h3>Pre-launch checklist</h3>
                  <button
                    onClick={() =>
                      void updateStatus(selectedCampaign, "archived")
                    }
                  >
                    Archive draft
                  </button>
                </div>
                {selectedCampaign.strategy.launchChecklist.map((item) => (
                  <label key={item}>
                    <input type="checkbox" /> {item}
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div className="commerce-campaign-placeholder">
              <span>Campaign review</span>
              <h2>Generate a grounded campaign draft.</h2>
              <p>
                You will get platform-sized copy, visual direction, budget
                structure, test angles, source grounding, and CSV export.
              </p>
              {selectedProducts.length > 0 && (
                <small>
                  Ready to build from {selectedProducts.length} selected product
                  {selectedProducts.length === 1 ? "" : "s"}.
                </small>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
