"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import "../settings/settings.css";
import {
  CATEGORY_TILES,
  INTEGRATION_CATEGORIES,
  categoryLabel,
  monogram,
  providerMeta,
} from "./catalog";

type Integration = {
  provider: string;
  configured: boolean;
  label?: string | null;
  keyHint?: string | null;
  agentTools?: string[];
  verifies?: boolean;
};

const KEY_HINTS: Record<string, string> = {
  ga4: '{"refreshToken":"…","propertyId":"…"} or an OAuth access token',
  "google-ads": '{"refreshToken":"…","developerToken":"…","customerId":"…"}',
};

const FEATURED = [
  "meta-ads",
  "klaviyo",
  "plausible",
  "dataforseo",
  "ga4",
  "mailchimp",
  "google-ads",
  "resend",
];

type SortMode = "recommended" | "name" | "connected";

export default function ConnectionsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [ga4PropertyId, setGa4PropertyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<SortMode>("recommended");
  const [selected, setSelected] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/integrations", { cache: "no-store" });
    const payload = (await response.json()) as {
      integrations?: Integration[];
      error?: string;
    };
    if (!response.ok) {
      throw new Error(payload.error || "Unable to load connections.");
    }
    setIntegrations(payload.integrations ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/integrations", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as {
          integrations?: Integration[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error || "Unable to load connections.");
        }
        if (!cancelled) setIntegrations(payload.integrations ?? []);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load connections.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  // OAuth callbacks (e.g. GA4) return here with ?ga4=connected|error&message=…
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ga4 = params.get("ga4");
    if (!ga4) return;
    if (ga4 === "connected") {
      setNotice("Google Analytics 4 connected with Google. Add your property id from the GA4 card if Cohorio has not picked it up yet.");
    } else {
      setError(params.get("message") || "Unable to connect Google Analytics 4.");
    }
    window.history.replaceState(null, "", "/connections");
  }, []);

  async function save(event: FormEvent<HTMLFormElement>, provider: string) {
    event.preventDefault();
    const apiKey = drafts[provider]?.trim() ?? "";
    const name = providerMeta(provider).name;
    setBusy(provider);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/integrations/${provider}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          provider === "ga4" ? { apiKey, propertyId: ga4PropertyId.trim() } : { apiKey },
        ),
      });
      const payload = (await response.json()) as { error?: string; verified?: boolean };
      if (!response.ok) throw new Error(payload.error || "Unable to save.");
      setDrafts((current) => ({ ...current, [provider]: "" }));
      if (provider === "ga4") setGa4PropertyId("");
      setNotice(
        payload.verified
          ? `${name} is connected and the key was verified.`
          : provider === "ga4"
            ? "GA4 saved. A pasted access token expires in about an hour — Connect with Google for a lasting connection."
            : `${name} key saved. Cohorio does not check or use this provider yet.`,
      );
      setSelected(null);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save.");
    } finally {
      setBusy("");
    }
  }

  async function connectGa4() {
    setBusy("ga4");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/integrations/ga4/oauth/start", {
        method: "POST",
        credentials: "same-origin",
      });
      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "Unable to start the GA4 connection.");
      }
      window.location.assign(payload.url);
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Unable to start the GA4 connection.");
      setBusy("");
    }
  }

  async function remove(provider: string) {
    setBusy(provider);
    setError("");
    try {
      const response = await fetch(`/api/integrations/${provider}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to remove.");
      setNotice(`${providerMeta(provider).name} disconnected.`);
      setSelected(null);
      await load();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Unable to remove.");
    } finally {
      setBusy("");
    }
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = integrations.filter((item) => {
      const meta = providerMeta(item.provider);
      if (category === "connected" && !item.configured) return false;
      if (category !== "all" && category !== "connected" && meta.category !== category) return false;
      if (!needle) return true;
      return (
        meta.name.toLowerCase().includes(needle) ||
        item.provider.includes(needle) ||
        meta.blurb.toLowerCase().includes(needle)
      );
    });
    const byName = (a: Integration, b: Integration) =>
      providerMeta(a.provider).name.localeCompare(providerMeta(b.provider).name);
    return filtered.sort((a, b) => {
      if (sort === "name") return byName(a, b);
      if (sort === "connected") {
        if (a.configured !== b.configured) return a.configured ? -1 : 1;
        return byName(a, b);
      }
      const rank = (item: Integration) => {
        const featured = FEATURED.indexOf(item.provider);
        if (featured !== -1) return featured;
        return FEATURED.length + (item.agentTools?.length ? 0 : 100);
      };
      return rank(a) - rank(b) || byName(a, b);
    });
  }, [integrations, query, category, sort]);

  const groups = useMemo(() => {
    const order = [...INTEGRATION_CATEGORIES.map((entry) => entry.id), "other"];
    return order
      .map((categoryId) => ({
        categoryId,
        items: visible.filter((item) => providerMeta(item.provider).category === categoryId),
      }))
      .filter((group) => group.items.length > 0);
  }, [visible]);

  const connectedCount = integrations.filter((item) => item.configured).length;
  const selectedItem = integrations.find((item) => item.provider === selected) ?? null;

  const capabilityNote = (item: Integration) => {
    if (item.agentTools?.length) {
      return `The Cohorio agent can use this today (${item.agentTools.join(", ")}). The key is checked against the provider before it is saved.`;
    }
    if (item.verifies) {
      return "Cohorio checks this key against the provider before saving it.";
    }
    return "Cohorio stores this key encrypted, but does not check or use this provider yet.";
  };

  return (
    <main className="settings-shell" id="main-content">
      <header className="settings-header">
        <Link href="/" className="settings-brand">
          <span>C</span> Cohorio
        </Link>
        <Link href="/" className="settings-back">
          Back to dashboard
        </Link>
      </header>
      <div className="settings-wrap integrations-wrap">
        <div className="settings-heading">
          <span>Connections</span>
          <h1>Discover integrations</h1>
          <p>
            Connect the tools you already use. Keys stay on the server, are stored encrypted and
            are never shown again. Providers marked Agent-ready can be used by the Cohorio agent.
          </p>
        </div>
        {error ? <p className="settings-error">{error}</p> : null}
        {notice ? <p className="settings-notice">{notice}</p> : null}

        <div className="integrations-toolbar">
          <input
            type="search"
            aria-label="Search integrations"
            placeholder="Search integrations…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <label className="integrations-sort">
            Sort by
            <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)}>
              <option value="recommended">Recommended</option>
              <option value="connected">Connected first</option>
              <option value="name">Name A–Z</option>
            </select>
          </label>
        </div>

        <div className="integrations-chips" role="group" aria-label="Filter by category">
          <button
            type="button"
            className={category === "all" ? "active" : ""}
            onClick={() => setCategory("all")}
          >
            All tools · {integrations.length}
          </button>
          <button
            type="button"
            className={category === "connected" ? "active" : ""}
            onClick={() => setCategory("connected")}
          >
            Connected · {connectedCount}
          </button>
          {INTEGRATION_CATEGORIES.map((entry) => {
            const count = integrations.filter(
              (item) => providerMeta(item.provider).category === entry.id,
            ).length;
            if (!count) return null;
            return (
              <button
                type="button"
                key={entry.id}
                className={category === entry.id ? "active" : ""}
                onClick={() => setCategory(entry.id)}
              >
                {entry.label} · {count}
              </button>
            );
          })}
        </div>

        {loading ? (
          <p className="integrations-empty">Loading integrations…</p>
        ) : visible.length === 0 ? (
          <p className="integrations-empty">
            No integrations match. Try a different search or category.
          </p>
        ) : (
          groups.map((group) => (
            <section className="integrations-group" key={group.categoryId}>
              <div className="integrations-group-heading">
                <h2>{categoryLabel(group.categoryId)}</h2>
                <p>
                  {INTEGRATION_CATEGORIES.find((entry) => entry.id === group.categoryId)?.blurb ??
                    "More providers from the tool catalog."}
                </p>
              </div>
              <div className="integrations-grid">
                {group.items.map((item) => {
                  const meta = providerMeta(item.provider);
                  const tile = CATEGORY_TILES[meta.category] ?? CATEGORY_TILES.other;
                  return (
                    <article className="integration-card" key={item.provider}>
                      <div className="integration-card-top">
                        <span
                          className="integration-tile"
                          style={{ background: tile.background, color: tile.color }}
                          aria-hidden="true"
                        >
                          {monogram(meta.name)}
                        </span>
                        <span className="integration-badges">
                          {FEATURED.includes(item.provider) ? (
                            <em className="integration-badge recommended">Recommended</em>
                          ) : null}
                          {item.agentTools?.length ? (
                            <em className="integration-badge agent">Agent-ready</em>
                          ) : null}
                        </span>
                      </div>
                      <h3>{meta.name}</h3>
                      <p className="integration-status">
                        <span
                          className={item.configured ? "integration-dot on" : "integration-dot"}
                          aria-hidden="true"
                        />
                        {item.configured
                          ? item.verifies
                            ? "Connected · verified when saved"
                            : "Saved · not verified"
                          : "Not connected"}
                      </p>
                      <p className="integration-blurb">{meta.blurb}</p>
                      <button
                        type="button"
                        className={item.configured ? "integration-manage" : "integration-connect"}
                        onClick={() => setSelected(item.provider)}
                      >
                        {item.configured ? "Manage" : `Connect ${meta.name}`}
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>

      {selectedItem ? (
        <div
          className="integration-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelected(null);
          }}
        >
          <div className="integration-dialog" role="dialog" aria-modal="true" aria-labelledby="integration-dialog-title">
            {(() => {
              const meta = providerMeta(selectedItem.provider);
              const tile = CATEGORY_TILES[meta.category] ?? CATEGORY_TILES.other;
              return (
                <>
                  <div className="integration-card-top">
                    <span
                      className="integration-tile"
                      style={{ background: tile.background, color: tile.color }}
                      aria-hidden="true"
                    >
                      {monogram(meta.name)}
                    </span>
                    <button
                      type="button"
                      className="integration-close"
                      aria-label="Close"
                      onClick={() => setSelected(null)}
                    >
                      ×
                    </button>
                  </div>
                  <h2 id="integration-dialog-title">{selectedItem.configured ? `Manage ${meta.name}` : `Connect ${meta.name}`}</h2>
                  <p className="integration-blurb">{meta.blurb}</p>
                  <p className="integration-note">{capabilityNote(selectedItem)}</p>
                  <form onSubmit={(event) => void save(event, selectedItem.provider)}>
                    <label>
                      {selectedItem.configured ? "Replace API key" : "API key"}
                      <input
                        type="password"
                        autoFocus
                        autoComplete="off"
                        name={`${selectedItem.provider}-key`}
                        placeholder={
                          selectedItem.keyHint ?? KEY_HINTS[selectedItem.provider] ?? "API key"
                        }
                        value={drafts[selectedItem.provider] ?? ""}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [selectedItem.provider]: event.target.value,
                          }))
                        }
                      />
                    </label>
                    {selectedItem.provider === "ga4" ? (
                      <>
                        <label>
                          GA4 property id (for a pasted token)
                          <input
                            inputMode="numeric"
                            autoComplete="off"
                            name="ga4-property-id"
                            placeholder="Property id"
                            value={ga4PropertyId}
                            onChange={(event) => setGa4PropertyId(event.target.value)}
                          />
                        </label>
                        <button
                          type="button"
                          className="integration-google"
                          disabled={busy === "ga4"}
                          onClick={() => void connectGa4()}
                        >
                          Connect with Google (recommended)
                        </button>
                      </>
                    ) : null}
                    <div className="integration-dialog-actions">
                      <button
                        type="submit"
                        className="integration-connect"
                        disabled={busy === selectedItem.provider}
                      >
                        {busy === selectedItem.provider ? "Saving…" : "Save key"}
                      </button>
                      <button type="button" onClick={() => setSelected(null)}>
                        Cancel
                      </button>
                      {selectedItem.configured ? (
                        <button
                          type="button"
                          className="integration-remove"
                          disabled={busy === selectedItem.provider}
                          onClick={() => void remove(selectedItem.provider)}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </form>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}
    </main>
  );
}
