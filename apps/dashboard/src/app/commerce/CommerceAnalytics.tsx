"use client";

import { useEffect, useMemo, useState } from "react";

type Range = "7d" | "30d" | "60d";

type SeriesPoint = {
  date: string;
  revenue: number;
  ordersCount: number;
};

const ranges: { id: Range; days: number; label: string }[] = [
  { id: "7d", days: 7, label: "7 days" },
  { id: "30d", days: 30, label: "30 days" },
  { id: "60d", days: 60, label: "60 days" },
];

function addDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function money(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

export default function CommerceAnalytics({
  connectionId,
}: {
  connectionId: string | null;
}) {
  const [range, setRange] = useState<Range>("30d");
  const [snapshot, setSnapshot] = useState<{
    connectionId: string;
    series: SeriesPoint[];
    currencyCode: string;
    error: string;
  } | null>(null);

  useEffect(() => {
    if (!connectionId) return;
    let cancelled = false;
    fetch(`/api/shopify/connections/${connectionId}/overview`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          error?: string;
          overview?: {
            currencyCode?: string;
            series?: SeriesPoint[];
          };
        };
        if (!response.ok || !payload.overview) {
          throw new Error(payload.error || "Unable to load store analytics.");
        }
        if (cancelled) return;
        setSnapshot({
          connectionId,
          currencyCode: payload.overview.currencyCode ?? "USD",
          series: payload.overview.series ?? [],
          error: "",
        });
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setSnapshot({
          connectionId,
          currencyCode: "USD",
          series: [],
          error:
            loadError instanceof Error
              ? loadError.message
              : "Unable to load store analytics.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [connectionId]);

  const current = snapshot?.connectionId === connectionId ? snapshot : null;
  const loading = Boolean(connectionId) && current === null;
  const currencyCode = current?.currencyCode ?? "USD";
  const error = current?.error ?? "";

  const days = ranges.find((item) => item.id === range)?.days ?? 30;
  const visible = useMemo(() => {
    const series = current?.series ?? [];
    const latest = series.at(-1)?.date;
    if (!latest) return [];
    const cutoff = addDays(latest, -(days - 1));
    return series.filter((point) => point.date >= cutoff);
  }, [current, days]);
  const maximum = Math.max(1, ...visible.map((point) => point.revenue));
  const revenue = visible.reduce((total, point) => total + point.revenue, 0);
  const orders = visible.reduce((total, point) => total + point.ordersCount, 0);

  return (
    <section className="commerce-analytics">
      <div className="commerce-title-row">
        <div>
          <span className="commerce-kicker">Analytics</span>
          <h1>Store performance</h1>
          <p>Daily net sales and orders from the last Shopify sync.</p>
        </div>
        <div className="commerce-range">
          {ranges.map((item) => (
            <button
              key={item.id}
              className={range === item.id ? "active" : ""}
              onClick={() => setRange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {!connectionId ? (
        <p className="commerce-section-empty">
          Connect a Shopify store to load analytics.
        </p>
      ) : loading ? (
        <p className="commerce-section-empty">Loading synced store metrics.</p>
      ) : error ? (
        <p className="commerce-section-empty" role="alert">
          {error}
        </p>
      ) : (
        <>
          <div className="commerce-analytics-totals">
            <article>
              <span>Net sales</span>
              <strong>{money(revenue, currencyCode)}</strong>
            </article>
            <article>
              <span>Orders</span>
              <strong>{orders.toLocaleString()}</strong>
            </article>
          </div>
          {visible.length ? (
            <div className="commerce-analytics-series">
              {visible.map((point) => (
                <div key={point.date}>
                  <span
                    style={{ height: `${Math.max(4, (point.revenue / maximum) * 120)}px` }}
                    title={`${point.date}: ${money(point.revenue, currencyCode)}`}
                  />
                  <small>
                    {new Intl.DateTimeFormat(undefined, {
                      month: "short",
                      day: "numeric",
                      timeZone: "UTC",
                    }).format(new Date(`${point.date}T00:00:00Z`))}
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <p className="commerce-section-empty">
              Sync this store to load daily net sales.
            </p>
          )}
        </>
      )}
    </section>
  );
}
