"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { accountInitials, useAccount } from "@/lib/use-account";
import AdCampaignBuilder from "./AdCampaignBuilder";
import ProductCroWorkspace from "./ProductCroWorkspace";
import "./commerce.css";

type Section = "Overview" | "Products" | "Campaigns" | "Lifecycle" | "Analytics";

type ShopifyConnection = {
  id: string;
  shopDomain: string;
  displayName: string;
  shopEmail: string | null;
  currencyCode: string | null;
  timezone: string | null;
  scopes: string[];
  status: "active" | "error";
  productsCount: number;
  ordersCount: number;
  lastError: string | null;
  installedAt: string;
  lastSyncedAt: string | null;
};

type StoreOverview = {
  currencyCode: string;
  complete: boolean;
  lastSyncedAt: string | null;
  metrics: {
    revenue: number;
    revenueChange: number | null;
    orders: number;
    ordersChange: number | null;
    averageOrderValue: number;
    averageOrderValueChange: number | null;
    products: number;
    inventoryUnits: number;
  };
  daily: {
    date: string;
    currentRevenue: number;
    currentOrders: number;
    previousRevenue: number;
    previousOrders: number;
  }[];
  products: {
    id: string;
    title: string;
    handle: string;
    productType: string | null;
    status: string;
    totalInventory: number;
    minimumPrice: number;
    currencyCode: string | null;
    imageUrl: string | null;
    revenue30d: number;
    unitsSold30d: number;
  }[];
};

function Icon({
  children,
  size = 20,
}: {
  children: ReactNode;
  size?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const icons = {
  home: (
    <>
      <path d="m3 11 9-8 9 8" />
      <path d="M5 10v10h14V10M9 20v-6h6v6" />
    </>
  ),
  overview: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </>
  ),
  bag: (
    <>
      <path d="M6 8h12l1 13H5L6 8Z" />
      <path d="M9 9V6a3 3 0 0 1 6 0v3" />
    </>
  ),
  megaphone: (
    <>
      <path d="m3 11 15-6v14L3 13v-2Z" />
      <path d="M7 14v5a2 2 0 0 0 2 2h2v-5M21 9v6" />
    </>
  ),
  lifecycle: (
    <>
      <path d="M20 7h-7V1" />
      <path d="M20 7a9 9 0 1 0 1 8" />
      <path d="m20 7-5-5" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  spark: (
    <>
      <path d="m12 3-1.1 3.2a7.4 7.4 0 0 1-4.7 4.7L3 12l3.2 1.1a7.4 7.4 0 0 1 4.7 4.7L12 21l1.1-3.2a7.4 7.4 0 0 1 4.7-4.7L21 12l-3.2-1.1a7.4 7.4 0 0 1-4.7-4.7L12 3Z" />
    </>
  ),
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  up: <path d="m18 15-6-6-6 6" />,
  down: <path d="m6 9 6 6 6-6" />,
  check: <path d="m5 12 4 4L19 6" />,
  alert: (
    <>
      <path d="M10.3 3.9 2.1 18a2 2 0 0 0 1.7 3h16.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M17 15a6 6 0 0 1 5 6" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1A7 7 0 0 0 15 6.2L14.7 3h-4l-.4 3.2a7 7 0 0 0-1.5.9l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 1.5.9l.4 3.2h4l.4-3.2a7 7 0 0 0 1.5-.9l2.4 1 2-3.4-2-1.5a7 7 0 0 0 .1-1Z" />
    </>
  ),
  external: (
    <>
      <path d="M15 3h6v6M10 14 21 3" />
      <path d="M18 13v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h7" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
};

function formatMoney(value: number, currencyCode: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
}

function formatCompactMoney(value: number, currencyCode: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currencyCode,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function trendLabel(change: number | null) {
  if (change === null) return "New";
  return `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
}

function chartPath(values: number[], maximum: number) {
  if (!values.length) return "";
  return values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * 700;
      const y = 170 - (value / maximum) * 145;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

const initialFlows = [
  {
    name: "Welcome series",
    trigger: "Newsletter signup",
    messages: 5,
    revenue: "$8,420",
    status: true,
    tone: "mint",
  },
  {
    name: "Abandoned checkout",
    trigger: "Checkout started",
    messages: 3,
    revenue: "$6,780",
    status: true,
    tone: "peach",
  },
  {
    name: "Post-purchase",
    trigger: "Order fulfilled",
    messages: 4,
    revenue: "$3,240",
    status: true,
    tone: "blue",
  },
  {
    name: "Win-back",
    trigger: "90 days inactive",
    messages: 3,
    revenue: "$0",
    status: false,
    tone: "violet",
  },
];

function BrandMark() {
  return (
    <span className="commerce-brand-mark" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

export default function CommerceSuite() {
  const router = useRouter();
  const account = useAccount();
  const userFirstName =
    account?.user.name?.trim().split(/\s+/)[0] || "there";
  const [section, setSection] = useState<Section>("Overview");
  const [flows, setFlows] = useState(initialFlows);
  const [applied, setApplied] = useState<number[]>([]);
  const [connections, setConnections] = useState<ShopifyConnection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [storeMenuOpen, setStoreMenuOpen] = useState(false);
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [shopDomain, setShopDomain] = useState("");
  const [shopifyConfigured, setShopifyConfigured] = useState(true);
  const [connectionLoading, setConnectionLoading] = useState(true);
  const [connectionMessage, setConnectionMessage] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [overview, setOverview] = useState<StoreOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  const selectedConnection = useMemo(
    () =>
      connections.find((connection) => connection.id === selectedConnectionId) ??
      connections[0] ??
      null,
    [connections, selectedConnectionId],
  );

  const metricCards = useMemo(() => {
    const currency = overview?.currencyCode ?? selectedConnection?.currencyCode ?? "USD";
    const values = overview?.metrics;
    return [
      {
        label: "Net sales",
        value: formatMoney(values?.revenue ?? 0, currency),
        trend: trendLabel(values ? values.revenueChange : 0),
        positive: (values?.revenueChange ?? 0) >= 0,
        note: "vs. previous 30 days",
        icon: icons.chart,
        color: "green",
      },
      {
        label: "Orders",
        value: (values?.orders ?? 0).toLocaleString(),
        trend: trendLabel(values ? values.ordersChange : 0),
        positive: (values?.ordersChange ?? 0) >= 0,
        note: "orders in 30 days",
        icon: icons.bag,
        color: "blue",
      },
      {
        label: "Average order value",
        value: formatMoney(values?.averageOrderValue ?? 0, currency),
        trend: trendLabel(values ? values.averageOrderValueChange : 0),
        positive: (values?.averageOrderValueChange ?? 0) >= 0,
        note: `from ${(values?.orders ?? 0).toLocaleString()} orders`,
        icon: icons.target,
        color: "violet",
      },
      {
        label: "Inventory",
        value: (values?.inventoryUnits ?? 0).toLocaleString(),
        trend: `${(values?.products ?? 0).toLocaleString()} products`,
        positive: true,
        note: "units currently in stock",
        icon: icons.users,
        color: "amber",
      },
    ];
  }, [overview, selectedConnection]);

  const chart = useMemo(() => {
    const current = overview?.daily.map((metric) => metric.currentRevenue) ?? [];
    const previous =
      overview?.daily.map((metric) => metric.previousRevenue) ?? [];
    const maximum = Math.max(...current, ...previous, 1);
    const currentPath = chartPath(current, maximum);
    return {
      currentPath,
      previousPath: chartPath(previous, maximum),
      areaPath: currentPath ? `${currentPath} L700 185 L0 185 Z` : "",
      maximum,
    };
  }, [overview]);

  const opportunities = useMemo(() => {
    if (!overview) return [];
    const recommendations: {
      title: string;
      detail: string;
      impact: string;
      effort: string;
      icon: ReactNode;
      tone: string;
    }[] = [];
    const currency = overview.currencyCode;
    const topProduct = overview.products.find((product) => product.revenue30d > 0);
    const lowStock = overview.products.find(
      (product) => product.totalInventory >= 0 && product.totalInventory < 10,
    );

    if (topProduct) {
      recommendations.push({
        title: `Extend ${topProduct.title}'s momentum`,
        detail: `${topProduct.title} leads the catalog with ${formatMoney(topProduct.revenue30d, currency)} in 30-day revenue. Feature it in the next campaign.`,
        impact: "Top seller",
        effort: "Quick win",
        icon: icons.target,
        tone: "green",
      });
    }
    if (lowStock) {
      recommendations.push({
        title: `Restock ${lowStock.title}`,
        detail: `Only ${lowStock.totalInventory.toLocaleString()} units remain while the product generated ${formatMoney(lowStock.revenue30d, currency)} in 30 days.`,
        impact: "Inventory risk",
        effort: "Urgent",
        icon: icons.alert,
        tone: "red",
      });
    }
    if (!overview.complete) {
      recommendations.push({
        title: "Complete the store data sync",
        detail:
          "Store net sales come from Shopify reports. Product revenue is still partial because the catalog or order history exceeded the fast-sync limit.",
        impact: "Data quality",
        effort: "Medium",
        icon: icons.chart,
        tone: "purple",
      });
    }
    if (!recommendations.length) {
      recommendations.push({
        title: "Generate your first commerce campaign",
        detail:
          "Your store data is ready. Build a product campaign from the connected catalog and recent order performance.",
        impact: "Ready",
        effort: "Quick win",
        icon: icons.megaphone,
        tone: "green",
      });
    }
    return recommendations.slice(0, 3);
  }, [overview]);

  async function loadOverview(connectionId: string) {
    try {
      const response = await fetch(
        `/api/shopify/connections/${connectionId}/overview`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as {
        overview?: StoreOverview;
        error?: string;
      };
      if (!response.ok || !payload.overview) {
        throw new Error(payload.error || "Unable to load store overview.");
      }
      setOverview(payload.overview);
    } catch (error) {
      setOverview(null);
      setConnectionMessage(
        error instanceof Error ? error.message : "Unable to load store overview.",
      );
    } finally {
      setOverviewLoading(false);
    }
  }

  async function loadConnections() {
    try {
      const response = await fetch("/api/shopify/connections", {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        configured: boolean;
        connections: ShopifyConnection[];
        error?: string;
      };
      setShopifyConfigured(payload.configured);
      setConnections(payload.connections);
      setSelectedConnectionId(
        (current) => {
          const saved = window.localStorage.getItem(
            "cohorio_shopify_connection",
          );
          return (
            payload.connections.find(
              (connection) =>
                connection.id === current || connection.id === saved,
            )?.id ??
            payload.connections[0]?.id ??
            ""
          );
        },
      );
      if (payload.error) setConnectionMessage(payload.error);
    } catch {
      setConnectionMessage("Unable to load Shopify connections.");
    } finally {
      setConnectionLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/shopify/connections", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as {
          configured: boolean;
          connections: ShopifyConnection[];
          error?: string;
        };
        if (cancelled) return;
        setShopifyConfigured(payload.configured);
        setConnections(payload.connections);
        const savedConnection = window.localStorage.getItem(
          "cohorio_shopify_connection",
        );
        const selected =
          payload.connections.find(
            (connection) => connection.id === savedConnection,
          )?.id ??
          payload.connections[0]?.id ??
          "";
        setSelectedConnectionId(selected);
        const params = new URL(window.location.href).searchParams;
        const oauthStatus = params.get("shopify");
        const oauthMessage = params.get("message");
        if (oauthMessage) setConnectionMessage(oauthMessage);
        if (params.has("shopify")) {
          window.history.replaceState({}, "", "/commerce");
        }
        if (oauthStatus === "connected" && selected) {
          setSyncing(true);
          fetch(`/api/shopify/connections/${selected}/sync`, {
            method: "POST",
          })
            .then(async (syncResponse) => {
              const syncPayload = (await syncResponse.json()) as {
                error?: string;
              };
              if (!syncResponse.ok) {
                throw new Error(syncPayload.error || "Initial sync failed.");
              }
              await loadOverview(selected);
            })
            .catch((error) => {
              setConnectionMessage(
                error instanceof Error
                  ? error.message
                  : "Unable to sync this store.",
              );
            })
            .finally(() => setSyncing(false));
        }
        if (payload.error) setConnectionMessage(payload.error);
      })
      .catch(() => {
        if (!cancelled) {
          setConnectionMessage("Unable to load Shopify connections.");
        }
      })
      .finally(() => {
        if (!cancelled) setConnectionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedConnectionId) return;
    let cancelled = false;
    fetch(`/api/shopify/connections/${selectedConnectionId}/overview`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          overview?: StoreOverview;
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok || !payload.overview) {
          throw new Error(payload.error || "Unable to load store overview.");
        }
        setOverview(payload.overview);
      })
      .catch((error) => {
        if (!cancelled) {
          setOverview(null);
          setConnectionMessage(
            error instanceof Error
              ? error.message
              : "Unable to load store overview.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setOverviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedConnectionId]);

  function toggleFlow(index: number) {
    setFlows((current) =>
      current.map((flow, flowIndex) =>
        flowIndex === index ? { ...flow, status: !flow.status } : flow,
      ),
    );
  }

  function applyOpportunity(index: number) {
    setApplied((current) =>
      current.includes(index) ? current : [...current, index],
    );
  }

  function connectStore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!shopDomain.trim()) return;
    router.push(
      `/api/shopify/oauth/start?shop=${encodeURIComponent(shopDomain.trim())}`,
    );
  }

  async function syncStore() {
    if (!selectedConnection) {
      setConnectModalOpen(true);
      return;
    }
    setSyncing(true);
    setOverviewLoading(true);
    setConnectionMessage("");
    try {
      const response = await fetch(
        `/api/shopify/connections/${selectedConnection.id}/sync`,
        { method: "POST" },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Sync failed.");
      setConnectionMessage(`${selectedConnection.displayName} synced successfully.`);
      await loadConnections();
      await loadOverview(selectedConnection.id);
    } catch (error) {
      setConnectionMessage(
        error instanceof Error ? error.message : "Unable to sync this store.",
      );
    } finally {
      setSyncing(false);
    }
  }

  async function disconnectStore(id: string) {
    const response = await fetch(`/api/shopify/connections/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setConnectionMessage("Unable to disconnect this store.");
      return;
    }
    setConnections((current) => current.filter((item) => item.id !== id));
    setSelectedConnectionId("");
    setOverview(null);
    setStoreMenuOpen(false);
    setConnectionMessage("Shopify store disconnected.");
  }

  return (
    <div className="commerce-shell">
      <aside className="commerce-sidebar">
        <Link href="/" className="commerce-brand">
          <BrandMark />
          <span>Cohorio</span>
        </Link>

        <div className="commerce-store-picker">
          <button
            className="commerce-store-switch"
            onClick={() => setStoreMenuOpen((current) => !current)}
          >
            <span className="commerce-store-logo">
              {(selectedConnection?.displayName ?? "S").charAt(0)}
            </span>
            <div>
              <strong>
                {connectionLoading
                  ? "Loading stores..."
                  : selectedConnection?.displayName ?? "No store connected"}
              </strong>
              <small>
                {selectedConnection?.shopDomain ??
                  "Connect a Shopify store"}
              </small>
            </div>
            <b>{storeMenuOpen ? "⌃" : "⌄"}</b>
          </button>
          {storeMenuOpen && (
            <div className="commerce-store-menu">
              <div className="commerce-store-menu-heading">
                <span>Shopify stores</span>
                <small>{connections.length} connected</small>
              </div>
              {connections.map((connection) => (
                <div
                  className={`commerce-store-option ${
                    selectedConnection?.id === connection.id ? "selected" : ""
                  }`}
                  key={connection.id}
                >
                  <button
                    onClick={() => {
                      setSelectedConnectionId(connection.id);
                      setOverview(null);
                      setOverviewLoading(true);
                      window.localStorage.setItem(
                        "cohorio_shopify_connection",
                        connection.id,
                      );
                      setStoreMenuOpen(false);
                    }}
                  >
                    <span>{connection.displayName.charAt(0)}</span>
                    <div>
                      <strong>{connection.displayName}</strong>
                      <small>{connection.shopDomain}</small>
                    </div>
                    {selectedConnection?.id === connection.id && (
                      <Icon size={13}>{icons.check}</Icon>
                    )}
                  </button>
                  <button
                    className="commerce-disconnect"
                    aria-label={`Disconnect ${connection.displayName}`}
                    onClick={() => void disconnectStore(connection.id)}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                className="commerce-add-store"
                onClick={() => {
                  setStoreMenuOpen(false);
                  setConnectModalOpen(true);
                }}
              >
                <Icon size={15}>{icons.plus}</Icon>
                Add Shopify store
              </button>
            </div>
          )}
        </div>

        <nav>
          <p>Store workspace</p>
          {(
            [
              ["Overview", icons.overview],
              ["Products", icons.bag],
              ["Campaigns", icons.megaphone],
              ["Lifecycle", icons.lifecycle],
              ["Analytics", icons.chart],
            ] as [Section, ReactNode][]
          ).map(([label, icon]) => (
            <button
              key={label}
              className={section === label ? "active" : ""}
              onClick={() => setSection(label)}
            >
              <Icon size={18}>{icon}</Icon>
              {label}
              {label === "Products" && (
                <span className="commerce-nav-count">
                  {overview?.metrics.products ??
                    selectedConnection?.productsCount ??
                    0}
                </span>
              )}
              {label === "Lifecycle" && (
                <span className="commerce-nav-alert">1</span>
              )}
            </button>
          ))}
        </nav>

        <div className="commerce-sidebar-spacer" />

        <div className="commerce-health-card">
          <div>
            <span>Store health</span>
            <strong>82</strong>
          </div>
          <div className="commerce-health-track">
            <i />
          </div>
          <p>Strong foundation. Retention is your biggest growth opportunity.</p>
          <button onClick={() => setSection("Analytics")}>
            View health report <Icon size={14}>{icons.arrow}</Icon>
          </button>
        </div>

        <Link href="/" className="commerce-side-link">
          <Icon size={18}>{icons.home}</Icon>
          Main dashboard
        </Link>
        <Link href="/settings" className="commerce-side-link">
          <Icon size={18}>{icons.settings}</Icon>
          Settings
        </Link>
        <div className="commerce-user">
          <span>{accountInitials(account)}</span>
          <div>
            <strong>{account?.user.name ?? "Cohorio user"}</strong>
            <small>{account?.access.role ?? "member"}</small>
          </div>
          <b>•••</b>
        </div>
      </aside>

      <main className="commerce-main">
        <header className="commerce-topbar">
          <div className="commerce-mobile-brand">
            <BrandMark />
            Cohorio Commerce
          </div>
          <div className="commerce-breadcrumb">
            <span>{selectedConnection?.displayName ?? "Commerce"}</span>
            <b>/</b>
            <strong>{section}</strong>
          </div>
          <div className="commerce-top-actions">
            <button
              className={`commerce-connection ${
                selectedConnection?.status === "active" ? "connected" : ""
              }`}
              onClick={() => void syncStore()}
            >
              <span />
              {syncing
                ? "Syncing Shopify..."
                : selectedConnection
                  ? selectedConnection.status === "active"
                    ? "Shopify connected"
                    : "Shopify needs attention"
                  : "Connect Shopify"}
            </button>
            <a
              className="commerce-view-store"
              href={
                selectedConnection
                  ? `https://${selectedConnection.shopDomain}`
                  : "#"
              }
              target={selectedConnection ? "_blank" : undefined}
              rel={selectedConnection ? "noreferrer" : undefined}
            >
              View store <Icon size={14}>{icons.external}</Icon>
            </a>
          </div>
        </header>

        <div className="commerce-content">
          {(!shopifyConfigured || connectionMessage) && (
            <div
              className={`commerce-connection-banner ${
                !shopifyConfigured ? "warning" : ""
              }`}
            >
              <Icon size={16}>
                {!shopifyConfigured ? icons.alert : icons.check}
              </Icon>
              <span>
                {!shopifyConfigured
                  ? "Shopify backend is not configured yet. Add the environment variables and run the database migration."
                  : connectionMessage}
              </span>
              {!shopifyConfigured && (
                <code>npm run db:migrate</code>
              )}
              <button
                aria-label="Dismiss"
                onClick={() => setConnectionMessage("")}
              >
                ×
              </button>
            </div>
          )}
          {section === "Products" ? (
            <ProductCroWorkspace
              key={`${selectedConnection?.id ?? "none"}-${selectedConnection?.lastSyncedAt ?? "never"}`}
              connectionId={selectedConnection?.id ?? null}
              currencyCode={selectedConnection?.currencyCode ?? "USD"}
              shopDomain={selectedConnection?.shopDomain ?? null}
              onSync={syncStore}
            />
          ) : section === "Campaigns" ? (
            <AdCampaignBuilder
              key={selectedConnection?.id ?? "none"}
              connectionId={selectedConnection?.id ?? null}
              currencyCode={selectedConnection?.currencyCode ?? "USD"}
            />
          ) : (
            <>
          <section className="commerce-title-row">
            <div>
              <span className="commerce-kicker">Commerce intelligence</span>
              <h1>Good morning, {userFirstName}.</h1>
              <p>
                {selectedConnection
                  ? overviewLoading
                    ? "Cohorio is loading the latest Shopify performance data."
                    : `${(overview?.metrics.products ?? selectedConnection.productsCount).toLocaleString()} products are connected with ${(overview?.metrics.orders ?? 0).toLocaleString()} orders in the last 30 days.`
                  : "Connect a Shopify store to load products, orders, and revenue insights."}
              </p>
            </div>
            <div className="commerce-range">
              <button className="active">30 days</button>
              <button>90 days</button>
              <button>12 months</button>
            </div>
          </section>

          <section className="commerce-metrics">
            {metricCards.map((metric) => (
              <article key={metric.label}>
                <div className={`commerce-metric-icon ${metric.color}`}>
                  <Icon size={19}>{metric.icon}</Icon>
                </div>
                <div className="commerce-metric-label">
                  <span>{metric.label}</span>
                  <button aria-label={`More about ${metric.label}`}>•••</button>
                </div>
                <strong>{metric.value}</strong>
                <div className="commerce-metric-note">
                  <span className={metric.positive ? "positive" : "negative"}>
                    <Icon size={11}>
                      {metric.positive ? icons.up : icons.down}
                    </Icon>
                    {metric.trend}
                  </span>
                  <small>{metric.note}</small>
                </div>
              </article>
            ))}
          </section>

          <section className="commerce-middle-grid">
            <div className="commerce-revenue-card">
              <div className="commerce-card-heading">
                <div>
                  <h2>Revenue performance</h2>
                  <p>Daily net sales across your connected store.</p>
                </div>
                <div className="commerce-legend">
                  <span>
                    <i className="current" /> Current period
                  </span>
                  <span>
                    <i className="previous" /> Previous period
                  </span>
                </div>
              </div>
              <div className="commerce-chart-summary">
                <div>
                  <span>Net sales</span>
                  <strong>
                    {formatMoney(
                      overview?.metrics.revenue ?? 0,
                      overview?.currencyCode ?? "USD",
                    )}
                  </strong>
                </div>
                <span
                  className={
                    (overview?.metrics.revenueChange ?? 0) >= 0
                      ? "positive"
                      : "negative"
                  }
                >
                  <Icon size={12}>
                    {(overview?.metrics.revenueChange ?? 0) >= 0
                      ? icons.up
                      : icons.down}
                  </Icon>{" "}
                  {trendLabel(
                    overview ? overview.metrics.revenueChange : 0,
                  )}
                </span>
              </div>
              <div className="commerce-chart">
                <div className="commerce-y-axis">
                  <span>
                    {formatCompactMoney(
                      chart.maximum,
                      overview?.currencyCode ?? "USD",
                    )}
                  </span>
                  <span>
                    {formatCompactMoney(
                      chart.maximum * 0.67,
                      overview?.currencyCode ?? "USD",
                    )}
                  </span>
                  <span>
                    {formatCompactMoney(
                      chart.maximum * 0.33,
                      overview?.currencyCode ?? "USD",
                    )}
                  </span>
                  <span>
                    {formatCompactMoney(0, overview?.currencyCode ?? "USD")}
                  </span>
                </div>
                <svg viewBox="0 0 700 185" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#477e68" stopOpacity=".24" />
                      <stop offset="100%" stopColor="#477e68" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    className="commerce-grid-line"
                    d="M0 20H700M0 70H700M0 120H700M0 170H700"
                  />
                  <path
                    className="commerce-previous-line"
                    d={chart.previousPath}
                  />
                  <path
                    className="commerce-area"
                    d={chart.areaPath}
                  />
                  <path
                    className="commerce-current-line"
                    d={chart.currentPath}
                  />
                  <circle
                    cx="700"
                    cy={
                      170 -
                      ((overview?.daily.at(-1)?.currentRevenue ?? 0) /
                        chart.maximum) *
                        145
                    }
                    r="4"
                    className="commerce-chart-dot"
                  />
                </svg>
                <div className="commerce-x-axis">
                  {(overview?.daily ?? [])
                    .filter(
                      (_, index, values) =>
                        index % 6 === 0 || index === values.length - 1,
                    )
                    .map((metric) => (
                      <span key={metric.date}>
                        {new Intl.DateTimeFormat(undefined, {
                          month: "short",
                          day: "numeric",
                        }).format(new Date(`${metric.date}T00:00:00Z`))}
                      </span>
                    ))}
                </div>
              </div>
            </div>

            <aside className="commerce-ai-card">
              <div className="commerce-ai-heading">
                <span>
                  <Icon size={19}>{icons.spark}</Icon>
                </span>
                <div>
                  <small>Cohorio intelligence</small>
                  <h2>Growth opportunities</h2>
                </div>
              </div>
              <p className="commerce-ai-intro">
                Prioritized from your store, customer, and campaign data.
              </p>
              <div className="commerce-opportunities">
                {opportunities.map((opportunity, index) => (
                  <article key={opportunity.title}>
                    <span className={`commerce-opportunity-icon ${opportunity.tone}`}>
                      <Icon size={17}>{opportunity.icon}</Icon>
                    </span>
                    <div>
                      <strong>{opportunity.title}</strong>
                      <p>{opportunity.detail}</p>
                      <div>
                        <span>{opportunity.impact}</span>
                        <small>{opportunity.effort}</small>
                      </div>
                    </div>
                    <button
                      className={applied.includes(index) ? "applied" : ""}
                      onClick={() => applyOpportunity(index)}
                    >
                      <Icon size={14}>
                        {applied.includes(index) ? icons.check : icons.arrow}
                      </Icon>
                    </button>
                  </article>
                ))}
              </div>
              <button className="commerce-all-opportunities">
                View all recommendations <Icon size={15}>{icons.arrow}</Icon>
              </button>
            </aside>
          </section>

          <section className="commerce-bottom-grid">
            <div className="commerce-products-card">
              <div className="commerce-card-heading">
                <div>
                  <h2>Product performance</h2>
                  <p>30-day revenue, sales, inventory, and pricing.</p>
                </div>
                <button onClick={() => setSection("Products")}>
                  View all products <Icon size={14}>{icons.arrow}</Icon>
                </button>
              </div>
              <div className="commerce-table">
                <div className="commerce-table-head">
                  <span>Product</span>
                  <span>Revenue</span>
                  <span>Units sold</span>
                  <span>Stock</span>
                  <span>Starting price</span>
                </div>
                {(overview?.products ?? []).map((product) => (
                  <button className="commerce-product-row" key={product.id}>
                    <span className="commerce-product-name">
                      <i
                        className={product.imageUrl ? "has-image" : "sage"}
                        style={
                          product.imageUrl
                            ? { backgroundImage: `url("${product.imageUrl}")` }
                            : undefined
                        }
                      >
                        {!product.imageUrl && <span />}
                      </i>
                      <span>
                        <strong>{product.title}</strong>
                        <small>{product.productType || product.status}</small>
                      </span>
                    </span>
                    <strong>
                      {formatMoney(
                        product.revenue30d,
                        product.currencyCode ?? overview?.currencyCode ?? "USD",
                      )}
                    </strong>
                    <span>{product.unitsSold30d.toLocaleString()}</span>
                    <span
                      className={product.totalInventory < 10 ? "low-stock" : ""}
                    >
                      {product.totalInventory < 10 && (
                        <Icon size={12}>{icons.alert}</Icon>
                      )}
                      {product.totalInventory.toLocaleString()}
                    </span>
                    <span>
                      {formatMoney(
                        product.minimumPrice,
                        product.currencyCode ?? overview?.currencyCode ?? "USD",
                      )}
                    </span>
                  </button>
                ))}
                {!overviewLoading && !(overview?.products.length ?? 0) && (
                  <div className="commerce-products-empty">
                    Sync this store to load its Shopify product catalog.
                  </div>
                )}
              </div>
            </div>

            <aside className="commerce-flows-card">
              <div className="commerce-card-heading">
                <div>
                  <h2>Lifecycle flows</h2>
                  <p>$18.4k attributed this month</p>
                </div>
                <button onClick={() => setSection("Lifecycle")}>
                  Manage
                </button>
              </div>
              <div className="commerce-flow-list">
                {flows.map((flow, index) => (
                  <article key={flow.name}>
                    <span className={`commerce-flow-icon ${flow.tone}`}>
                      <Icon size={17}>{icons.mail}</Icon>
                    </span>
                    <div>
                      <strong>{flow.name}</strong>
                      <small>
                        {flow.trigger} · {flow.messages} emails
                      </small>
                    </div>
                    <span className="commerce-flow-revenue">{flow.revenue}</span>
                    <button
                      aria-label={`${flow.status ? "Pause" : "Enable"} ${flow.name}`}
                      className={`commerce-toggle ${flow.status ? "on" : ""}`}
                      onClick={() => toggleFlow(index)}
                    >
                      <i />
                    </button>
                  </article>
                ))}
              </div>
              <button className="commerce-create-flow">
                <Icon size={15}>{icons.plus}</Icon>
                Create a lifecycle flow
              </button>
            </aside>
          </section>
            </>
          )}
        </div>

        {connectModalOpen && (
          <div
            className="commerce-modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.currentTarget === event.target) setConnectModalOpen(false);
            }}
          >
            <div
              className="commerce-connect-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="connect-shopify-title"
            >
              <button
                className="commerce-modal-close"
                aria-label="Close"
                onClick={() => setConnectModalOpen(false)}
              >
                ×
              </button>
              <span className="commerce-shopify-glyph">S</span>
              <h2 id="connect-shopify-title">Connect a Shopify store</h2>
              <p>
                Enter the store&apos;s <strong>.myshopify.com</strong> domain.
                Shopify will ask the merchant to approve read-only access.
              </p>
              <form onSubmit={connectStore}>
                <label htmlFor="shop-domain">Shop domain</label>
                <div>
                  <input
                    id="shop-domain"
                    autoFocus
                    value={shopDomain}
                    onChange={(event) => setShopDomain(event.target.value)}
                    placeholder="northstar-goods.myshopify.com"
                  />
                </div>
                <button type="submit" disabled={!shopDomain.trim()}>
                  Continue to Shopify <Icon size={15}>{icons.arrow}</Icon>
                </button>
              </form>
              <small>
                You can connect multiple stores and switch between them from
                the store menu.
              </small>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
