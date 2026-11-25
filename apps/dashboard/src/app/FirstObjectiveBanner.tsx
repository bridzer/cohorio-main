"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { objectiveById } from "@/lib/objectives";
import "./first-objective.css";

/**
 * Dashboard awareness of onboarding activation: when the workspace completed
 * onboarding with a chosen first objective, surface it above the fold with a
 * direct link to where the work happens. Advisory only — never blocks.
 */
export default function FirstObjectiveBanner() {
  const router = useRouter();
  const [objective, setObjective] = useState<{
    name: string;
    href: string;
    hrefLabel: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/onboarding", { cache: "no-store" });
        const payload = (await response.json()) as {
          session?: { completedAt: string | null; selectedObjective: string | null } | null;
        };
        if (!response.ok || cancelled) return;
        const id =
          payload.session?.completedAt ? payload.session.selectedObjective : null;
        const definition = id ? objectiveById(id) : null;
        if (definition) {
          setObjective({
            name: definition.name,
            href: definition.href,
            hrefLabel: definition.hrefLabel,
          });
        }
      } catch {
        // The banner is advisory; a failed load hides it silently.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!objective) return null;

  return (
    <section className="first-objective" aria-label="Your first objective">
      <div>
        <span>Your first objective</span>
        <strong>{objective.name}</strong>
      </div>
      <div>
        <button type="button" onClick={() => router.push(objective.href)}>
          Open in {objective.hrefLabel}
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => router.push("/onboarding")}
        >
          Change
        </button>
      </div>
    </section>
  );
}
