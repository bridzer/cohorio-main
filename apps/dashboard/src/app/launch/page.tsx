"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import "../settings/settings.css";

type AttachableType = "copilot" | "social" | "lifecycle";

type Launch = {
  id: string;
  name: string;
  createdAt: string;
  assets: { assetType: AttachableType; assetId: string; title: string }[];
};

type WorkspaceAsset = {
  type: AttachableType | "campaign";
  id: string;
  title: string;
  createdAt: string;
};

const TYPE_LABEL: Record<AttachableType, string> = {
  copilot: "Copy",
  social: "Social",
  lifecycle: "Email",
};

export default function LaunchPage() {
  const [launches, setLaunches] = useState<Launch[] | null>(null);
  const [assets, setAssets] = useState<WorkspaceAsset[]>([]);
  const [name, setName] = useState("");
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadLaunches() {
    const response = await fetch("/api/launches", { cache: "no-store" });
    const payload = (await response.json()) as { launches?: Launch[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "Unable to load launches.");
    setLaunches(payload.launches ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [launchResponse, assetResponse] = await Promise.all([
          fetch("/api/launches", { cache: "no-store" }),
          fetch("/api/assets", { cache: "no-store" }),
        ]);
        const launchPayload = (await launchResponse.json()) as {
          launches?: Launch[];
          error?: string;
        };
        const assetPayload = (await assetResponse.json()) as {
          assets?: WorkspaceAsset[];
        };
        if (!launchResponse.ok) {
          throw new Error(launchPayload.error || "Unable to load launches.");
        }
        if (cancelled) return;
        setLaunches(launchPayload.launches ?? []);
        setAssets(
          (assetPayload.assets ?? []).filter((asset) => asset.type !== "campaign"),
        );
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load launches.");
        setLaunches([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/launches", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = (await response.json()) as { launch?: Launch; error?: string };
      if (!response.ok || !payload.launch) {
        throw new Error(payload.error || "Unable to create this launch.");
      }
      setLaunches((current) => [payload.launch!, ...(current ?? [])]);
      setName("");
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "Unable to create this launch.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function attach(launchId: string) {
    const value = selection[launchId];
    if (!value) return;
    const [assetType, assetId] = value.split(":");
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/launches/${launchId}/assets`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetType, assetId }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to attach this asset.");
      setSelection((current) => ({ ...current, [launchId]: "" }));
      await loadLaunches();
    } catch (attachError) {
      setError(
        attachError instanceof Error ? attachError.message : "Unable to attach this asset.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="settings-shell">
      <header className="settings-header">
        <Link href="/" className="settings-brand">
          <span>C</span> Cohorio
        </Link>
        <Link href="/" className="settings-back">
          Back to dashboard
        </Link>
      </header>
      <div className="settings-wrap">
        <div className="settings-heading">
          <span>Launch</span>
          <h1>Launch binders</h1>
          <p>
            Group saved copy, social posts, and lifecycle drafts under one
            launch. Attached items link to the originals; nothing is copied.
          </p>
        </div>
        {error ? <p className="settings-error">{error}</p> : null}

        <section className="settings-card">
          <div>
            <h2>New launch</h2>
          </div>
          <form className="settings-inline-form" onSubmit={(event) => void create(event)}>
            <input
              required
              maxLength={160}
              placeholder="Spring collection launch"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <button disabled={busy}>Create launch</button>
          </form>
        </section>

        {launches === null ? (
          <p>Loading launches.</p>
        ) : launches.length === 0 ? (
          <section className="settings-card">
            <p>No launches yet.</p>
          </section>
        ) : (
          launches.map((launch) => {
            const attached = new Set(
              launch.assets.map((asset) => `${asset.assetType}:${asset.assetId}`),
            );
            const available = assets.filter(
              (asset) => !attached.has(`${asset.type}:${asset.id}`),
            );
            return (
              <section className="settings-card" key={launch.id}>
                <div>
                  <h2>{launch.name}</h2>
                  <p>
                    {launch.assets.length} attached ·{" "}
                    {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
                      new Date(launch.createdAt),
                    )}
                  </p>
                </div>
                <div className="settings-list">
                  {launch.assets.length ? (
                    launch.assets.map((asset) => (
                      <div className="settings-row" key={`${asset.assetType}:${asset.assetId}`}>
                        <span>
                          <strong>{asset.title}</strong>
                          <small>{TYPE_LABEL[asset.assetType]}</small>
                        </span>
                      </div>
                    ))
                  ) : (
                    <p>Nothing attached yet.</p>
                  )}
                </div>
                <form
                  className="settings-inline-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void attach(launch.id);
                  }}
                >
                  <select
                    aria-label="Saved asset"
                    value={selection[launch.id] ?? ""}
                    onChange={(event) =>
                      setSelection((current) => ({
                        ...current,
                        [launch.id]: event.target.value,
                      }))
                    }
                  >
                    <option value="">
                      {available.length ? "Choose a saved asset" : "No saved assets to attach"}
                    </option>
                    {available.map((asset) => (
                      <option key={`${asset.type}:${asset.id}`} value={`${asset.type}:${asset.id}`}>
                        {TYPE_LABEL[asset.type as AttachableType]} · {asset.title.slice(0, 80)}
                      </option>
                    ))}
                  </select>
                  <button disabled={busy || !selection[launch.id]}>Attach</button>
                </form>
              </section>
            );
          })
        )}
      </div>
    </main>
  );
}
