"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type WorkspaceAsset = {
  type: "copilot" | "social" | "lifecycle" | "campaign";
  id: string;
  title: string;
  createdAt: string;
  href: string;
};

const TYPE_LABEL = {
  copilot: "Copy",
  social: "Social",
  lifecycle: "Email",
  campaign: "Campaign",
} as const;

export default function LibraryPage() {
  const [assets, setAssets] = useState<WorkspaceAsset[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/assets", { cache: "no-store" });
        const payload = (await response.json()) as {
          assets?: WorkspaceAsset[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error || "Unable to load assets.");
        }
        if (!cancelled) setAssets(payload.assets ?? []);
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load assets.",
          );
          setAssets([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="library-page">
      <p>
        <Link href="/">Back to Co-Pilot</Link>
      </p>
      <h1>Asset library</h1>
      <p>Copy, email sequences, ad campaigns, and social posts saved for this workspace.</p>
      {error ? <p>{error}</p> : null}
      {assets === null ? (
        <p>Loading saved assets.</p>
      ) : assets.length === 0 ? (
        <p>No saved assets.</p>
      ) : (
        <ul className="library-list">
          {assets.map((asset) => (
            <li key={`${asset.type}:${asset.id}`}>
              <Link href={asset.href}>
                <span>{TYPE_LABEL[asset.type]}</span>
                <strong>{asset.title}</strong>
                <time dateTime={asset.createdAt}>
                  {new Intl.DateTimeFormat("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(asset.createdAt))}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
