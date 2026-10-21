import { Suspense } from "react";
import { AgentWorkspace } from "./AgentWorkspace";
import "./agent.css";

export default function AgentPage() {
  return (
    // AgentWorkspace reads ?thread= with useSearchParams, which needs a Suspense boundary.
    <Suspense fallback={<div className="agent-shell agent-loading">Loading Cohorio…</div>}>
      <AgentWorkspace />
    </Suspense>
  );
}
