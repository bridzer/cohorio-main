"use client";

import { useEffect, useMemo, useState } from "react";
import { startShopifyOAuth } from "@/lib/shopify/start-oauth";

type Recommendation = {
  area: string;
  title: string;
  detail: string;
  priority: "high" | "medium" | "low";
  pointsAvailable: number;
};

type ProductAnalysis = {
  id: string;
  title: string;
  handle: string;
  descriptionText: string;
  vendor: string | null;
  productType: string | null;
  tags: string[];
  status: string;
  totalInventory: number;
  mediaCount: number;
  variantsCount: number;
  onlineStoreUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  minimumPrice: number;
  currencyCode: string | null;
  imageUrl: string | null;
  revenue30d: number;
  unitsSold30d: number;
  croScore: number;
  croRecommendations: Recommendation[];
};

type ProductSummary = {
  products: number;
  averageScore: number;
  needsWork: number;
  highPriorityIssues: number;
};

type ProductDraft = {
  title: string;
  descriptionText: string;
  vendor: string;
  productType: string;
  tags: string;
  seoTitle: string;
  seoDescription: string;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED";
};

function formatMoney(value: number, currencyCode: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
}

function scoreLabel(score: number) {
  if (score >= 80) return "Strong";
  if (score >= 60) return "Fair";
  return "Needs work";
}

function textToHtml(value: string) {
  const escaped = value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  return escaped
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replaceAll("\n", "<br>")}</p>`)
    .join("");
}

export default function ProductCroWorkspace({
  connectionId,
  currencyCode,
  shopDomain,
  onSync,
}: {
  connectionId: string | null;
  currencyCode: string;
  shopDomain: string | null;
  onSync: () => Promise<void>;
}) {
  const [products, setProducts] = useState<ProductAnalysis[]>([]);
  const [summary, setSummary] = useState<ProductSummary | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "needs-work" | "strong">("all");
  const [loading, setLoading] = useState(Boolean(connectionId));
  const [rescanning, setRescanning] = useState(false);
  const [error, setError] = useState("");
  const [implementation, setImplementation] = useState<{
    recommendation: Recommendation;
    product: ProductAnalysis;
  } | null>(null);
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [implementationError, setImplementationError] = useState("");
  const [reauthorizationRequired, setReauthorizationRequired] = useState(false);
  const [schemaStatus, setSchemaStatus] = useState("");

  useEffect(() => {
    if (!connectionId) return;
    let cancelled = false;
    fetch(`/api/shopify/connections/${connectionId}/products`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          products?: ProductAnalysis[];
          summary?: ProductSummary;
          error?: string;
        };
        if (!response.ok || !payload.products || !payload.summary) {
          throw new Error(payload.error || "Unable to load product analysis.");
        }
        if (cancelled) return;
        setProducts(payload.products);
        setSummary(payload.summary);
        setSelectedId(payload.products[0]?.id ?? "");
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load product analysis.",
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

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesSearch =
        !query ||
        product.title.toLowerCase().includes(query) ||
        product.vendor?.toLowerCase().includes(query) ||
        product.productType?.toLowerCase().includes(query);
      const matchesFilter =
        filter === "all" ||
        (filter === "needs-work" && product.croScore < 60) ||
        (filter === "strong" && product.croScore >= 80);
      return matchesSearch && matchesFilter;
    });
  }, [filter, products, search]);

  const selectedProduct =
    products.find((product) => product.id === selectedId) ??
    filteredProducts[0] ??
    null;

  async function copyJsonLd(productId: string) {
    if (!connectionId) return;
    setSchemaStatus("");
    try {
      const response = await fetch(
        `/api/shopify/connections/${connectionId}/products/${encodeURIComponent(productId)}/schema`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as {
        jsonLd?: unknown;
        error?: string;
      };
      if (!response.ok || !payload.jsonLd) {
        throw new Error(payload.error || "Unable to build product schema.");
      }
      await navigator.clipboard.writeText(
        `<script type="application/ld+json">\n${JSON.stringify(payload.jsonLd, null, 2)}\n</script>`,
      );
      setSchemaStatus("JSON-LD copied.");
    } catch (copyError) {
      setSchemaStatus(
        copyError instanceof Error
          ? copyError.message
          : "Unable to copy product schema.",
      );
    }
  }

  async function rescan() {
    setRescanning(true);
    setError("");
    try {
      await onSync();
    } catch {
      setError("Unable to refresh Shopify product data.");
    } finally {
      setRescanning(false);
    }
  }

  function productAdminUrl(product: ProductAnalysis) {
    if (!shopDomain) return product.onlineStoreUrl;
    const storeHandle = shopDomain.replace(/\.myshopify\.com$/i, "");
    const numericId = product.id.split("/").at(-1);
    if (!storeHandle || !numericId) return product.onlineStoreUrl;
    return `https://admin.shopify.com/store/${storeHandle}/products/${numericId}`;
  }

  function startImplementation(
    recommendation: Recommendation,
    product: ProductAnalysis,
  ) {
    if (recommendation.area === "Visual proof") {
      const adminUrl = productAdminUrl(product);
      if (adminUrl) window.open(adminUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setImplementation({ recommendation, product });
    setDraft({
      title: product.title,
      descriptionText: product.descriptionText,
      vendor: product.vendor ?? "",
      productType: product.productType ?? "",
      tags: product.tags.join(", "),
      seoTitle: product.seoTitle ?? "",
      seoDescription: product.seoDescription ?? "",
      status:
        product.status === "DRAFT" || product.status === "ARCHIVED"
          ? product.status
          : "ACTIVE",
    });
    setImplementationError("");
    setReauthorizationRequired(false);
  }

  async function applyImplementation() {
    if (!connectionId || !implementation || !draft) return;
    setSaving(true);
    setImplementationError("");
    setReauthorizationRequired(false);
    const area = implementation.recommendation.area;
    const changes: Record<string, unknown> = {
      productId: implementation.product.id,
    };
    if (area === "Headline") changes.title = draft.title;
    if (area === "Value proposition") {
      changes.descriptionHtml = textToHtml(draft.descriptionText);
    }
    if (area === "SEO") {
      changes.seoTitle = draft.seoTitle;
      changes.seoDescription = draft.seoDescription;
    }
    if (area === "Merchandising") {
      changes.vendor = draft.vendor;
      changes.productType = draft.productType;
      changes.tags = draft.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
    }
    if (area === "Purchase readiness") changes.status = draft.status;

    try {
      const response = await fetch(
        `/api/shopify/connections/${connectionId}/products`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(changes),
        },
      );
      const payload = (await response.json()) as {
        error?: string;
        code?: string;
      };
      if (!response.ok) {
        if (payload.code === "SHOPIFY_REAUTH_REQUIRED") {
          setReauthorizationRequired(true);
        }
        throw new Error(payload.error || "Unable to update this product.");
      }
      setImplementation(null);
      setDraft(null);
      await onSync();
    } catch (reason) {
      setImplementationError(
        reason instanceof Error
          ? reason.message
          : "Unable to update this product.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!connectionId) {
    return (
      <section className="commerce-cro-empty">
        <span>Product CRO</span>
        <h1>Connect a store to analyze product pages.</h1>
        <p>
          Cohorio scores product messaging, imagery, SEO, merchandising, and
          purchase readiness from your Shopify catalog.
        </p>
      </section>
    );
  }

  return (
    <section className="commerce-cro-workspace">
      <div className="commerce-cro-heading">
        <div>
          <span className="commerce-kicker">Product page CRO</span>
          <h1>Turn catalog gaps into conversion wins.</h1>
          <p>
            Transparent readiness scores based on product copy, visual proof,
            SEO, merchandising completeness, and purchase availability.
          </p>
        </div>
        <button onClick={() => void rescan()} disabled={rescanning}>
          {rescanning ? "Scanning Shopify..." : "Rescan products"}
        </button>
      </div>

      {error && <div className="commerce-cro-error">{error}</div>}

      <div className="commerce-cro-summary">
        <article>
          <span>Catalog score</span>
          <strong>{loading ? "—" : `${summary?.averageScore ?? 0}/100`}</strong>
          <small>Average CRO readiness</small>
        </article>
        <article>
          <span>Products scanned</span>
          <strong>{loading ? "—" : summary?.products ?? 0}</strong>
          <small>Latest Shopify sync</small>
        </article>
        <article>
          <span>Need attention</span>
          <strong>{loading ? "—" : summary?.needsWork ?? 0}</strong>
          <small>Scoring below 60</small>
        </article>
        <article>
          <span>High-priority issues</span>
          <strong>{loading ? "—" : summary?.highPriorityIssues ?? 0}</strong>
          <small>Largest score opportunities</small>
        </article>
      </div>

      <div className="commerce-cro-grid">
        <div className="commerce-cro-catalog">
          <div className="commerce-cro-toolbar">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products"
              aria-label="Search products"
            />
            <select
              value={filter}
              onChange={(event) =>
                setFilter(
                  event.target.value as "all" | "needs-work" | "strong",
                )
              }
              aria-label="Filter products by score"
            >
              <option value="all">All scores</option>
              <option value="needs-work">Needs work</option>
              <option value="strong">Strong</option>
            </select>
          </div>

          <div className="commerce-cro-product-list">
            {loading && <p>Loading Shopify products...</p>}
            {!loading &&
              filteredProducts.map((product) => (
                <button
                  key={product.id}
                  className={selectedProduct?.id === product.id ? "active" : ""}
                  onClick={() => setSelectedId(product.id)}
                >
                  <i
                    className={product.imageUrl ? "has-image" : ""}
                    style={
                      product.imageUrl
                        ? { backgroundImage: `url("${product.imageUrl}")` }
                        : undefined
                    }
                  >
                    {!product.imageUrl && product.title.charAt(0)}
                  </i>
                  <span>
                    <strong>{product.title}</strong>
                    <small>
                      {product.productType || product.vendor || product.status}
                    </small>
                  </span>
                  <b className={`score-${scoreLabel(product.croScore).toLowerCase().replace(" ", "-")}`}>
                    {product.croScore}
                  </b>
                </button>
              ))}
            {!loading && !filteredProducts.length && (
              <p>No products match this filter. Rescan after updating Shopify.</p>
            )}
          </div>
        </div>

        <div className="commerce-cro-detail">
          {selectedProduct ? (
            <>
              <div className="commerce-cro-product-heading">
                <div>
                  <span>{selectedProduct.vendor || "Shopify product"}</span>
                  <h2>{selectedProduct.title}</h2>
                  <p>
                    {selectedProduct.productType || "Uncategorized"} ·{" "}
                    {selectedProduct.status.toLowerCase()}
                  </p>
                </div>
                <div
                  className="commerce-cro-score"
                  style={{
                    background: `conic-gradient(#507d65 ${selectedProduct.croScore}%, #e7ebe7 0)`,
                  }}
                >
                  <span>
                    <strong>{selectedProduct.croScore}</strong>
                    <small>{scoreLabel(selectedProduct.croScore)}</small>
                  </span>
                </div>
              </div>

              <div className="commerce-cro-stats">
                <div>
                  <span>30-day revenue</span>
                  <strong>
                    {formatMoney(
                      selectedProduct.revenue30d,
                      selectedProduct.currencyCode || currencyCode,
                    )}
                  </strong>
                </div>
                <div>
                  <span>Inventory</span>
                  <strong>{selectedProduct.totalInventory.toLocaleString()}</strong>
                </div>
                <div>
                  <span>Media</span>
                  <strong>{selectedProduct.mediaCount}</strong>
                </div>
                <div>
                  <span>Variants</span>
                  <strong>{selectedProduct.variantsCount}</strong>
                </div>
              </div>

              <div className="commerce-cro-readiness">
                <div>
                  <span>Description</span>
                  <strong>
                    {selectedProduct.descriptionText.length.toLocaleString()} chars
                  </strong>
                </div>
                <div>
                  <span>SEO title</span>
                  <strong>{selectedProduct.seoTitle ? "Present" : "Missing"}</strong>
                </div>
                <div>
                  <span>SEO description</span>
                  <strong>
                    {selectedProduct.seoDescription ? "Present" : "Missing"}
                  </strong>
                </div>
                <div>
                  <span>Tags</span>
                  <strong>{selectedProduct.tags.length}</strong>
                </div>
              </div>

              <div className="commerce-cro-recommendations">
                <div>
                  <h3>Prioritized recommendations</h3>
                  <button
                    type="button"
                    className="commerce-cro-schema"
                    onClick={() => void copyJsonLd(selectedProduct.id)}
                  >
                    Copy JSON-LD
                  </button>
                  {schemaStatus ? <small role="status">{schemaStatus}</small> : null}
                  {selectedProduct.onlineStoreUrl && (
                    <a
                      href={selectedProduct.onlineStoreUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View product page ↗
                    </a>
                  )}
                </div>
                {selectedProduct.croRecommendations.length ? (
                  selectedProduct.croRecommendations.map((recommendation) => (
                    <article
                      key={`${recommendation.area}-${recommendation.title}`}
                    >
                      <span className={`priority-${recommendation.priority}`}>
                        {recommendation.priority}
                      </span>
                      <div>
                        <small>{recommendation.area}</small>
                        <strong>{recommendation.title}</strong>
                        <p>{recommendation.detail}</p>
                      </div>
                      <aside className="commerce-cro-rec-action">
                        <b>+{recommendation.pointsAvailable}</b>
                        <button
                          onClick={() =>
                            startImplementation(
                              recommendation,
                              selectedProduct,
                            )
                          }
                        >
                          {recommendation.area === "Visual proof"
                            ? "Open Shopify"
                            : "Implement"}
                        </button>
                      </aside>
                    </article>
                  ))
                ) : (
                  <p className="commerce-cro-complete">
                    {selectedProduct.croScore === 0
                      ? "Rescan products to calculate this product's CRO readiness."
                      : "This product meets the current catalog-readiness checks. Continue validating changes with customer behavior and A/B tests."}
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="commerce-cro-no-selection">
              Sync Shopify, then select a product to view its CRO analysis.
            </div>
          )}
        </div>
      </div>

      {implementation && draft && (
        <div
          className="commerce-cro-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !saving) {
              setImplementation(null);
            }
          }}
        >
          <div
            className="commerce-cro-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="commerce-cro-implementation-title"
          >
            <div className="commerce-cro-modal-heading">
              <div>
                <span>{implementation.recommendation.area}</span>
                <h2 id="commerce-cro-implementation-title">
                  {implementation.recommendation.title}
                </h2>
                <p>{implementation.product.title}</p>
              </div>
              <button
                aria-label="Close implementation editor"
                onClick={() => setImplementation(null)}
                disabled={saving}
              >
                ×
              </button>
            </div>

            <div className="commerce-cro-editor">
              {implementation.recommendation.area === "Headline" && (
                <label>
                  Product title
                  <input
                    value={draft.title}
                    maxLength={255}
                    onChange={(event) =>
                      setDraft({ ...draft, title: event.target.value })
                    }
                  />
                  <small>{draft.title.length}/255 characters</small>
                </label>
              )}

              {implementation.recommendation.area === "Value proposition" && (
                <label>
                  Product description
                  <textarea
                    rows={10}
                    value={draft.descriptionText}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        descriptionText: event.target.value,
                      })
                    }
                  />
                  <small>
                    Use outcomes, differentiators, proof, specifications, and
                    objection handling. Saving replaces the current formatted
                    description with these paragraphs.
                  </small>
                </label>
              )}

              {implementation.recommendation.area === "SEO" && (
                <>
                  <label>
                    SEO title
                    <input
                      value={draft.seoTitle}
                      maxLength={255}
                      onChange={(event) =>
                        setDraft({ ...draft, seoTitle: event.target.value })
                      }
                    />
                    <small>{draft.seoTitle.length}/60 recommended</small>
                  </label>
                  <label>
                    SEO description
                    <textarea
                      rows={4}
                      value={draft.seoDescription}
                      maxLength={1000}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          seoDescription: event.target.value,
                        })
                      }
                    />
                    <small>{draft.seoDescription.length}/160 recommended</small>
                  </label>
                </>
              )}

              {implementation.recommendation.area === "Merchandising" && (
                <>
                  <div className="commerce-cro-editor-grid">
                    <label>
                      Vendor
                      <input
                        value={draft.vendor}
                        maxLength={255}
                        onChange={(event) =>
                          setDraft({ ...draft, vendor: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Product type
                      <input
                        value={draft.productType}
                        maxLength={255}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            productType: event.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                  <label>
                    Tags
                    <input
                      value={draft.tags}
                      onChange={(event) =>
                        setDraft({ ...draft, tags: event.target.value })
                      }
                      placeholder="summer, bestseller, lightweight"
                    />
                    <small>Separate tags with commas.</small>
                  </label>
                </>
              )}

              {implementation.recommendation.area === "Purchase readiness" && (
                <>
                  <label>
                    Product status
                    <select
                      value={draft.status}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          status: event.target.value as ProductDraft["status"],
                        })
                      }
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="DRAFT">Draft</option>
                      <option value="ARCHIVED">Archived</option>
                    </select>
                  </label>
                  <p className="commerce-cro-editor-note">
                    Pricing and inventory changes require variant and location
                    controls. Use Shopify Admin for those changes to avoid
                    modifying the wrong inventory location.
                    {productAdminUrl(implementation.product) && (
                      <a
                        href={productAdminUrl(implementation.product) ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open product in Shopify ↗
                      </a>
                    )}
                  </p>
                </>
              )}
            </div>

            {implementationError && (
              <div className="commerce-cro-implementation-error">
                {implementationError}
                {reauthorizationRequired && shopDomain && (
                  <button
                    type="button"
                    onClick={() => {
                      void startShopifyOAuth(shopDomain).catch((reason) => {
                        setImplementationError(
                          reason instanceof Error
                            ? reason.message
                            : "Unable to reconnect Shopify.",
                        );
                      });
                    }}
                  >
                    Reconnect Shopify
                  </button>
                )}
              </div>
            )}

            <div className="commerce-cro-modal-actions">
              <p>This applies the reviewed fields directly to Shopify.</p>
              <div>
                <button
                  onClick={() => setImplementation(null)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  className="primary"
                  onClick={() => void applyImplementation()}
                  disabled={saving}
                >
                  {saving ? "Applying..." : "Apply to Shopify"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
