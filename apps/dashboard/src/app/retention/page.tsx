"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import "../settings/settings.css";

const KINDS = ["survey", "offer", "confirm"] as const;
type Kind = (typeof KINDS)[number];

type Step = { position: number; kind: Kind; body: string };

const KIND_LABEL: Record<Kind, string> = {
  survey: "Exit survey",
  offer: "Retention offer",
  confirm: "Confirm cancellation",
};

function renumber(steps: Step[]) {
  return steps.map((step, index) => ({ ...step, position: index + 1 }));
}

export default function RetentionPage() {
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/retention/steps", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as { steps?: Step[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Unable to load retention steps.");
        if (!cancelled) setSteps(payload.steps ?? []);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(
          loadError instanceof Error ? loadError.message : "Unable to load retention steps.",
        );
        setSteps([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function update(index: number, patch: Partial<Step>) {
    setSteps((current) =>
      (current ?? []).map((step, position) =>
        position === index ? { ...step, ...patch } : step,
      ),
    );
  }

  function move(index: number, delta: number) {
    setSteps((current) => {
      const next = [...(current ?? [])];
      const target = index + delta;
      if (target < 0 || target >= next.length) return next;
      [next[index], next[target]] = [next[target], next[index]];
      return renumber(next);
    });
  }

  async function save() {
    if (!steps) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/retention/steps", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps: renumber(steps) }),
      });
      const payload = (await response.json()) as { steps?: Step[]; error?: string };
      if (!response.ok || !payload.steps) {
        throw new Error(payload.error || "Unable to save retention steps.");
      }
      setSteps(payload.steps);
      setNotice("Cancel flow saved.");
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Unable to save retention steps.",
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
          <span>Retention</span>
          <h1>Cancel flow</h1>
          <p>
            The ordered steps a customer sees when they cancel. Use the arrows
            to reorder, then save. Cohorio stores this plan; it does not run
            the flow inside your billing provider.
          </p>
        </div>
        {error ? <p className="settings-error">{error}</p> : null}
        {notice ? <p className="settings-notice">{notice}</p> : null}

        <section className="settings-card">
          <div>
            <h2>Steps</h2>
            <p>{steps ? `${steps.length} steps` : "Loading"}</p>
          </div>
          {steps === null ? (
            <p>Loading retention steps.</p>
          ) : (
            <>
              {steps.length === 0 ? <p>No steps yet.</p> : null}
              <ol className="retention-steps">
                {steps.map((step, index) => (
                  <li key={`${index}-${step.position}`}>
                    <div className="retention-step-controls">
                      <strong>{index + 1}.</strong>
                      <select
                        aria-label={`Step ${index + 1} kind`}
                        value={step.kind}
                        onChange={(event) => update(index, { kind: event.target.value as Kind })}
                      >
                        {KINDS.map((kind) => (
                          <option key={kind} value={kind}>
                            {KIND_LABEL[kind]}
                          </option>
                        ))}
                      </select>
                      <button type="button" onClick={() => move(index, -1)} disabled={index === 0}>
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => move(index, 1)}
                        disabled={index === steps.length - 1}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setSteps((current) =>
                            renumber((current ?? []).filter((_, position) => position !== index)),
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                    <textarea
                      aria-label={`Step ${index + 1} text`}
                      rows={3}
                      maxLength={4000}
                      value={step.body}
                      onChange={(event) => update(index, { body: event.target.value })}
                    />
                  </li>
                ))}
              </ol>
              <div className="settings-security-actions">
                <button
                  type="button"
                  onClick={() =>
                    setSteps((current) =>
                      renumber([...(current ?? []), { position: 0, kind: "survey", body: "" }]),
                    )
                  }
                >
                  Add step
                </button>
                <button type="button" disabled={busy} onClick={() => void save()}>
                  {busy ? "Saving..." : "Save cancel flow"}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
