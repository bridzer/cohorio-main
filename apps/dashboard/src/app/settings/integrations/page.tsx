"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import "../settings.css";

type Integration = { provider: string; configured: boolean };

const FEATURED = [
  "ga4",
  "mailchimp",
  "google-ads",
  "meta-ads",
  "resend",
  "klaviyo",
  "stripe",
];

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

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
    void load().catch((loadError: unknown) => {
      if (!cancelled) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load connections.",
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>, provider: string) {
    event.preventDefault();
    const apiKey = drafts[provider]?.trim() ?? "";
    setBusy(provider);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/integrations/${provider}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to save.");
      setDrafts((current) => ({ ...current, [provider]: "" }));
      setNotice(`${provider} is connected.`);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save.");
    } finally {
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
      await load();
    } catch (removeError) {
      setError(
        removeError instanceof Error ? removeError.message : "Unable to remove.",
      );
    } finally {
      setBusy("");
    }
  }

  const ordered = [...integrations].sort((left, right) => {
    const leftRank = FEATURED.indexOf(left.provider);
    const rightRank = FEATURED.indexOf(right.provider);
    if (leftRank === -1 && rightRank === -1) {
      return left.provider.localeCompare(right.provider);
    }
    if (leftRank === -1) return 1;
    if (rightRank === -1) return -1;
    return leftRank - rightRank;
  });

  return (
    <main className="settings-shell">
      <header className="settings-header">
        <Link href="/" className="settings-brand">
          <span>C</span> Cohorio
        </Link>
        <Link href="/settings" className="settings-back">
          Back to settings
        </Link>
      </header>
      <div className="settings-wrap">
        <div className="settings-heading">
          <span>Connected accounts</span>
          <h1>Marketing tools</h1>
          <p>
            Store a key for GA4, Mailchimp, ads, and the rest of the tool
            catalog. Keys stay on the server and are never shown again.
          </p>
        </div>
        {error ? <p className="settings-error">{error}</p> : null}
        {notice ? <p className="settings-notice">{notice}</p> : null}
        <section className="settings-card">
          <div className="settings-list">
            {ordered.map((item) => (
              <form
                className="settings-row settings-integration-row"
                key={item.provider}
                onSubmit={(event) => void save(event, item.provider)}
              >
                <span>
                  <strong>{item.provider}</strong>
                  <small>{item.configured ? "Connected" : "Not connected"}</small>
                </span>
                <input
                  type="password"
                  autoComplete="off"
                  name={`${item.provider}-key`}
                  placeholder="API key"
                  value={drafts[item.provider] ?? ""}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [item.provider]: event.target.value,
                    }))
                  }
                />
                <button disabled={busy === item.provider} type="submit">
                  Save
                </button>
                {item.configured ? (
                  <button
                    disabled={busy === item.provider}
                    type="button"
                    onClick={() => void remove(item.provider)}
                  >
                    Remove
                  </button>
                ) : null}
              </form>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
