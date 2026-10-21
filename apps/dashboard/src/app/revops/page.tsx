"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import "../settings/settings.css";

const STAGES = [
  "subscriber",
  "lead",
  "mql",
  "sql",
  "opportunity",
  "customer",
] as const;

type Lead = {
  id: string;
  email: string;
  stage: (typeof STAGES)[number];
  score: number;
  createdAt: string;
};

export default function RevopsPage() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<Lead["stage"]>("lead");
  const [score, setScore] = useState("0");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/revops/leads", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as { leads?: Lead[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Unable to load leads.");
        if (!cancelled) setLeads(payload.leads ?? []);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load leads.");
        setLeads([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/revops/leads", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, stage, score: Number(score) }),
      });
      const payload = (await response.json()) as { lead?: Lead; error?: string };
      if (!response.ok || !payload.lead) {
        throw new Error(payload.error || "Unable to save this lead.");
      }
      setLeads((current) => [
        payload.lead!,
        ...(current ?? []).filter((lead) => lead.id !== payload.lead!.id),
      ]);
      setEmail("");
      setScore("0");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save this lead.");
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
          <span>RevOps</span>
          <h1>Lead pipeline</h1>
          <p>
            Leads you add for this workspace, with the stage and score you
            assign. Cohorio does not infer stages for anyone not on this list.
          </p>
        </div>
        {error ? <p className="settings-error">{error}</p> : null}

        <section className="settings-card">
          <div>
            <h2>Add or update a lead</h2>
            <p>Saving an existing email updates its stage and score.</p>
          </div>
          <form className="settings-inline-form" onSubmit={(event) => void save(event)}>
            <input
              type="email"
              required
              placeholder="person@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <select value={stage} onChange={(event) => setStage(event.target.value as Lead["stage"])}>
              {STAGES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              aria-label="Score"
              value={score}
              onChange={(event) => setScore(event.target.value)}
            />
            <button disabled={busy}>Save lead</button>
          </form>
        </section>

        <section className="settings-card">
          <div>
            <h2>Leads</h2>
            <p>{leads ? `${leads.length} saved` : "Loading"}</p>
          </div>
          {leads === null ? (
            <p>Loading leads.</p>
          ) : leads.length === 0 ? (
            <p>No leads yet.</p>
          ) : (
            <table className="workspace-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Stage</th>
                  <th>Score</th>
                  <th>Added</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id}>
                    <td>{lead.email}</td>
                    <td>{lead.stage}</td>
                    <td>{lead.score}</td>
                    <td>
                      {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
                        new Date(lead.createdAt),
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  );
}
