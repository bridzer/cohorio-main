"use client";

import { FormEvent, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { routeCopilotRequest } from "@/lib/copilot-route";
import {
  BRAND_BRAIN,
  FEATURE_WORKSPACES,
  INTELLIGENCE,
  findJob,
  type WorkspaceDefinition,
  type WorkspaceJob,
} from "@/lib/workspaces";
import { useRouter } from "next/navigation";

type IconName =
  | "spark"
  | "grid"
  | "chat"
  | "library"
  | "chart"
  | "plug"
  | "settings"
  | "arrow"
  | "check"
  | "social"
  | "ads"
  | "copy"
  | "search"
  | "mail"
  | "target"
  | "send"
  | "plus"
  | "bell"
  | "bag";

function Icon({
  name,
  size = 20,
  strokeWidth = 1.8,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}) {
  const paths: Record<IconName, React.ReactNode> = {
    spark: (
      <>
        <path d="m12 3-1.1 3.2a7.4 7.4 0 0 1-4.7 4.7L3 12l3.2 1.1a7.4 7.4 0 0 1 4.7 4.7L12 21l1.1-3.2a7.4 7.4 0 0 1 4.7-4.7L21 12l-3.2-1.1a7.4 7.4 0 0 1-4.7-4.7L12 3Z" />
        <path d="m19 3-.35 1.05a2.5 2.5 0 0 1-1.6 1.6L16 6l1.05.35a2.5 2.5 0 0 1 1.6 1.6L19 9l.35-1.05a2.5 2.5 0 0 1 1.6-1.6L22 6l-1.05-.35a2.5 2.5 0 0 1-1.6-1.6L19 3Z" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="3" width="7" height="7" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
        <rect x="14" y="14" width="7" height="7" rx="2" />
      </>
    ),
    chat: (
      <>
        <path d="M21 12a8 8 0 0 1-8 8H5l-3 2 1.2-4A9 9 0 1 1 21 12Z" />
        <path d="M8 11h8M8 15h5" />
      </>
    ),
    library: (
      <>
        <path d="M4 19.5V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v14.5" />
        <path d="M4 19.5A1.5 1.5 0 0 1 5.5 18H19M8 7h7M8 11h5" />
      </>
    ),
    chart: (
      <>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </>
    ),
    plug: (
      <>
        <path d="m8 12 4 4M14 6l4 4M7 17l-1.5 1.5a3.5 3.5 0 0 0 5 5L12 22M17 7l1.5-1.5a3.5 3.5 0 0 0-5-5L12 2" />
        <path d="m7 17 10-10" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63 1.7 1.7 0 0 0 10 3.08V3h4v.08A1.7 1.7 0 0 0 15 4.63a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9 1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z" />
      </>
    ),
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    social: (
      <>
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="5" r="3" />
        <circle cx="18" cy="19" r="3" />
        <path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" />
      </>
    ),
    ads: (
      <>
        <path d="m3 11 15-6v14L3 13v-2Z" />
        <path d="M7 14v5a2 2 0 0 0 2 2h2v-5" />
        <path d="M21 9v6" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="12" height="12" rx="2" />
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
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
    send: (
      <>
        <path d="m22 2-7 20-4-9-9-4 20-7Z" />
        <path d="M22 2 11 13" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    bag: (
      <>
        <path d="M6 8h12l1 13H5L6 8Z" />
        <path d="M9 9V6a3 3 0 0 1 6 0v3" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

const navItems: { label: string; icon: IconName }[] = [
  { label: "Overview", icon: "grid" },
  { label: "Ask Cohorio", icon: "chat" },
  { label: "Assets", icon: "library" },
  { label: "Performance", icon: "chart" },
  { label: "Connections", icon: "plug" },
  { label: "Commerce", icon: "bag" },
  { label: "RevOps", icon: "target" },
  { label: "Launch", icon: "send" },
  { label: "Retention", icon: "check" },
];

const navRoutes: Record<string, string> = {
  Assets: "/library",
  Commerce: "/commerce",
  RevOps: "/revops",
  Launch: "/launch",
  Retention: "/retention",
};

type DashboardAccount = {
  user: { name?: string | null; email?: string | null };
  access: {
    organizationName: string;
    workspaceName: string;
    role: string;
  };
};

type WorkspaceAsset = {
  type: "copilot" | "social" | "lifecycle" | "campaign";
  id: string;
  title: string;
  createdAt: string;
  href: string;
};

type CopilotRun = {
  id: string;
  title: string;
  output: string;
  created_at: string;
};

const ASSET_LABEL = {
  copilot: "Copy",
  social: "Social",
  lifecycle: "Email",
  campaign: "Campaign",
} as const;

function WorkspaceForm({
  workspace,
  running,
  output,
  onRun,
}: {
  workspace: WorkspaceDefinition;
  running: boolean;
  output: string;
  onRun: (job: WorkspaceJob, answers: Record<string, string>) => void;
}) {
  const [jobId, setJobId] = useState(workspace.jobs[0]?.id ?? "");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const job =
    workspace.jobs.find((item) => item.id === jobId) ?? workspace.jobs[0];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!job || running) return;
    onRun(job, answers);
  }

  if (!job) return null;

  return (
    <form className="workspace-form" onSubmit={submit}>
      <label>
        Request
        <select
          aria-label={`${workspace.name} request`}
          value={job.id}
          onChange={(event) => setJobId(event.target.value)}
        >
          {workspace.jobs.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <p className="workspace-job-detail">{job.detail}</p>
      {job.fields.map((field) => (
        <label key={field.id}>
          {field.label}
          {field.multiline ? (
            <textarea
              aria-label={field.label}
              required={field.required}
              placeholder={field.placeholder}
              value={answers[field.id] ?? ""}
              onChange={(event) =>
                setAnswers((current) => ({
                  ...current,
                  [field.id]: event.target.value,
                }))
              }
            />
          ) : (
            <input
              aria-label={field.label}
              required={field.required}
              placeholder={field.placeholder}
              value={answers[field.id] ?? ""}
              onChange={(event) =>
                setAnswers((current) => ({
                  ...current,
                  [field.id]: event.target.value,
                }))
              }
            />
          )}
        </label>
      ))}
      <button className="primary-action" type="submit" disabled={running}>
        {running ? "Working" : "Run"}
      </button>
      {output ? <p className="workspace-output">{output}</p> : null}
    </form>
  );
}

function subscribeToToday() {
  return () => {};
}

function todayLabelSnapshot() {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
}

export default function Home() {
  const router = useRouter();
  const [activeNav, setActiveNav] = useState("Overview");
  const [category, setCategory] = useState("All");
  const [prompt, setPrompt] = useState("");
  const [openWorkspaceId, setOpenWorkspaceId] = useState(
    FEATURE_WORKSPACES[0]?.id ?? "",
  );
  const [activeOutput, setActiveOutput] = useState<{
    workspaceId: string;
    text: string;
  } | null>(null);
  const [brandBrainProgress, setBrandBrainProgress] = useState(0);
  const [account, setAccount] = useState<DashboardAccount | null>(null);
  const [assistantMessage, setAssistantMessage] = useState(
    "What should Brand Brain work from?",
  );
  const todayLabel = useSyncExternalStore(
    subscribeToToday,
    todayLabelSnapshot,
    () => "",
  );
  const [assets, setAssets] = useState<WorkspaceAsset[]>([]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/marketing-context");
        if (!response.ok) return;
        const data = (await response.json()) as {
          progress?: { percentage?: number };
        };
        if (!cancelled) {
          setBrandBrainProgress(data.progress?.percentage ?? 0);
        }
      } catch {
        // The dashboard remains usable while context storage is unavailable.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/account", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as DashboardAccount;
        if (!cancelled) setAccount(data);
      } catch {
        // The protected API remains the source of truth for authorization.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/assets", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { assets?: WorkspaceAsset[] };
        if (!cancelled) setAssets(data.assets ?? []);
      } catch {
        // Recent work stays empty until the runs API is available.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const displayName = account?.user.name?.trim() || "there";
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const visibleWorkspaces = useMemo(
    () =>
      category === "All"
        ? FEATURE_WORKSPACES
        : FEATURE_WORKSPACES.filter((workspace) => workspace.name === category),
    [category],
  );
  const openWorkspace =
    visibleWorkspaces.find((workspace) => workspace.id === openWorkspaceId) ??
    visibleWorkspaces[0] ??
    null;
  async function refreshAssets() {
    const response = await fetch("/api/assets", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { assets?: WorkspaceAsset[] };
    setAssets(data.assets ?? []);
  }

  async function runWorkspace(
    workspace: WorkspaceDefinition,
    job: WorkspaceJob,
    answers: Record<string, string>,
    prompt?: string,
  ) {
    if (workspace.id === "content" && job.id === "social") {
      const source = answers.source?.trim();
      if (source) sessionStorage.setItem("cohorio-social-source", source);
      router.push("/social");
      return;
    }
    setRunning(true);
    setActiveNav("Ask Cohorio");
    setAssistantMessage("Working from your brand context...");
    setActiveOutput(null);
    try {
      const response = await fetch("/api/workspaces/run", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: workspace.id,
          jobId: job.id,
          answers,
          prompt,
        }),
      });
      const payload = (await response.json()) as {
        run?: CopilotRun;
        error?: string;
      };
      if (!response.ok || !payload.run) {
        throw new Error(payload.error || "Unable to run this workspace.");
      }
      setAssistantMessage(payload.run.output);
      setActiveOutput({ workspaceId: workspace.id, text: payload.run.output });
      await refreshAssets();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to run this workspace.";
      setAssistantMessage(message);
      setActiveOutput({ workspaceId: workspace.id, text: message });
    } finally {
      setRunning(false);
    }
  }

  function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt || running) return;
    setPrompt("");
    const route = routeCopilotRequest(cleanPrompt);
    if (route.workspaceId === "content" && route.jobId === "social") {
      sessionStorage.setItem("cohorio-social-source", cleanPrompt);
      router.push("/social");
      return;
    }
    const match = findJob(route.workspaceId, route.jobId) ?? {
      workspace: BRAND_BRAIN,
      job: BRAND_BRAIN.jobs[0],
    };
    if (!match.job) return;
    void runWorkspace(match.workspace, match.job, {}, cleanPrompt);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <span />
            <span />
            <span />
          </div>
          <span>Cohorio</span>
        </div>

        <div className="workspace-switcher">
          <div className="workspace-avatar">
            {account?.access.workspaceName?.[0]?.toUpperCase() ?? "W"}
          </div>
          <div>
            <strong>{account?.access.workspaceName ?? "Workspace"}</strong>
            <span>{account?.access.organizationName ?? "Cohorio"}</span>
          </div>
          <span className="workspace-chevron">⌄</span>
        </div>

        <nav aria-label="Main navigation">
          <p className="nav-label">Workspace</p>
          {navItems.map((item) => (
            <button
              key={item.label}
              className={`nav-item ${activeNav === item.label ? "active" : ""}`}
              onClick={() => {
                const route = navRoutes[item.label];
                if (route) {
                  router.push(route);
                  return;
                }
                setActiveNav(item.label);
              }}
            >
              <Icon name={item.icon} size={19} />
              {item.label}
              {item.label === "Ask Cohorio" && <span className="nav-new">AI</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-spacer" />

        <div className="context-card">
          <div className="context-card-heading">
            <span className="mini-orbit">
              <Icon name="spark" size={14} />
            </span>
            <strong>Brand brain</strong>
            <span>{brandBrainProgress}%</span>
          </div>
          <div className="progress-track">
            <span style={{ width: `${brandBrainProgress}%` }} />
          </div>
          <p>Complete your context so every output sounds like you.</p>
          <button onClick={() => router.push("/onboarding")}>
            {brandBrainProgress ? "Continue setup" : "Start setup"}{" "}
            <Icon name="arrow" size={15} />
          </button>
        </div>

        <button
          className="nav-item settings-button"
          onClick={() => router.push("/settings")}
        >
          <Icon name="settings" size={19} />
          Settings
        </button>
        <div className="user-row">
          <div className="user-avatar">{initials || "U"}</div>
          <div>
            <strong>{account?.user.name ?? "Cohorio user"}</strong>
            <span>{account?.user.email ?? "Signed in"}</span>
          </div>
          <span>•••</span>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="mobile-brand">
            <div className="brand-mark">
              <span />
              <span />
              <span />
            </div>
            Cohorio
          </div>
          <div className="topbar-actions">
            <button className="icon-button" aria-label="Notifications">
              <Icon name="bell" size={19} />
              <span className="notification-dot" />
            </button>
            <button
              className="invite-button"
              onClick={() => router.push("/settings")}
            >
              <Icon name="plus" size={17} />
              Invite team
            </button>
          </div>
        </header>

        <div className="content-wrap">
          {activeNav === "Assets" ? (
            <section className="workspace-panel">
              <div className="section-heading">
                <div>
                  <h2>Assets</h2>
                  <p>Saved work from Brand Brain and the workspaces.</p>
                </div>
              </div>
              {assets.length === 0 ? (
                <p className="activity-empty">No saved assets.</p>
              ) : (
                <div className="activity-list">
                  {assets.map((asset) => (
                    <button
                      className="activity-row"
                      key={`${asset.type}:${asset.id}`}
                      type="button"
                      onClick={() => router.push(asset.href)}
                    >
                      <span className="activity-copy">
                        <strong>{asset.title}</strong>
                        <span>
                          {ASSET_LABEL[asset.type]} ·{" "}
                          {new Intl.DateTimeFormat("en-US", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(asset.createdAt))}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          ) : activeNav === "Performance" ? (
            <section className="workspace-panel">
              <div className="section-heading">
                <div>
                  <h2>Performance</h2>
                  <p>
                    Store revenue, orders, and product metrics live in Commerce.
                  </p>
                </div>
              </div>
              <button
                className="manage-button"
                onClick={() => router.push("/commerce")}
              >
                Open Commerce <Icon name="arrow" size={16} />
              </button>
            </section>
          ) : activeNav === "Connections" ? (
            <section className="workspace-panel">
              <div className="section-heading">
                <div>
                  <h2>Connections</h2>
                  <p>Shopify stores and team access for this workspace.</p>
                </div>
              </div>
              <div className="connection-links">
                <button
                  className="manage-button"
                  onClick={() => router.push("/commerce")}
                >
                  Shopify stores <Icon name="arrow" size={16} />
                </button>
                <button
                  className="manage-button"
                  onClick={() => router.push("/settings")}
                >
                  Team members <Icon name="arrow" size={16} />
                </button>
              </div>
            </section>
          ) : (
            <>
          <section className="welcome-row">
            <div>
              <p className="eyebrow">{todayLabel}</p>
              <h1>Good morning, {displayName.split(/\s+/)[0]}.</h1>
              <p>Your marketing workspace is ready. What will you move forward today?</p>
            </div>
          </section>

          <section className="copilot-card">
            <div className="copilot-glow" />
            <div className="copilot-icon">
              <Icon name="spark" size={23} />
            </div>
            <div className="copilot-copy">
              <span className="copilot-label">Cohorio Co-Pilot · Brand Brain</span>
              <h2>{assistantMessage}</h2>
              <p>
                Ask for a homepage audit, a welcome email sequence, ad
                headlines, or a question about your product. Co-Pilot uses your
                saved brand context.
              </p>
              <form onSubmit={submitPrompt}>
                <input
                  aria-label="Ask Brand Brain"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Ask from your product, audience, and voice"
                />
                <button type="submit" aria-label="Send prompt" disabled={running}>
                  <Icon name="send" size={18} />
                </button>
              </form>
              <div className="quick-prompts">
                <button onClick={() => setPrompt("How should we describe the product in one line?")}>
                  Product line
                </button>
                <button onClick={() => setPrompt("Who is this for, and who is it not for?")}>
                  Audience
                </button>
                <button onClick={() => setPrompt("What should we sound like?")}>
                  Voice
                </button>
              </div>
            </div>
            <div className="copilot-visual" aria-hidden="true">
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <div className="orbit-center">
                <div className="brand-mark light">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
              <span className="orbit-dot dot-one" />
              <span className="orbit-dot dot-two" />
              <span className="orbit-dot dot-three" />
            </div>
          </section>

          <section className="workspace-panel-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Main engine</p>
                <h2>Cohorio Intelligence</h2>
                <p>{INTELLIGENCE.summary}</p>
              </div>
            </div>
            <WorkspaceForm
              workspace={INTELLIGENCE}
              running={running}
              output={
                activeOutput?.workspaceId === INTELLIGENCE.id
                  ? activeOutput.text
                  : ""
              }
              onRun={(job, answers) => {
                void runWorkspace(INTELLIGENCE, job, answers);
              }}
            />
          </section>

          <section className="tasks-section">
            <div className="section-heading">
              <div>
                <h2>Workspaces</h2>
                <p>Each workspace collects the inputs for that kind of work.</p>
              </div>
              <div className="filters" aria-label="Workspaces">
                {["All", ...FEATURE_WORKSPACES.map((workspace) => workspace.name)].map(
                  (item) => (
                    <button
                      key={item}
                      type="button"
                      className={category === item ? "active" : ""}
                      onClick={() => setCategory(item)}
                    >
                      {item}
                    </button>
                  ),
                )}
              </div>
            </div>
            <div className="task-grid">
              {visibleWorkspaces.map((workspace) => (
                <button
                  className={`task-card ${
                    openWorkspace?.id === workspace.id ? "selected" : ""
                  }`}
                  key={workspace.id}
                  type="button"
                  onClick={() => setOpenWorkspaceId(workspace.id)}
                >
                  <span className="task-icon blue">
                    <Icon name="spark" size={22} />
                  </span>
                  <span className="task-copy">
                    <strong>{workspace.name}</strong>
                    <span>{workspace.summary}</span>
                  </span>
                  <span className="task-arrow">
                    <Icon name="arrow" size={17} />
                  </span>
                </button>
              ))}
            </div>
            {openWorkspace ? (
              <div className="workspace-panel-card">
                <h3>{openWorkspace.name}</h3>
                <WorkspaceForm
                  key={openWorkspace.id}
                  workspace={openWorkspace}
                  running={running}
                  output={
                    activeOutput?.workspaceId === openWorkspace.id
                      ? activeOutput.text
                      : ""
                  }
                  onRun={(job, answers) => {
                    void runWorkspace(openWorkspace, job, answers);
                  }}
                />
              </div>
            ) : null}
          </section>

          <section className="bottom-grid">
            <div className="activity-panel">
              <div className="panel-heading">
                <div>
                  <h2>Recent work</h2>
                  <p>Pick up where you left off.</p>
                </div>
              </div>
              {assets.length === 0 ? (
                <p className="activity-empty">No saved assets.</p>
              ) : (
                <div className="activity-list">
                  {assets.slice(0, 6).map((asset) => (
                    <button
                      className="activity-row"
                      key={`${asset.type}:${asset.id}`}
                      type="button"
                      onClick={() => router.push(asset.href)}
                    >
                      <span className="activity-copy">
                        <strong>{asset.title}</strong>
                        <span>
                          {ASSET_LABEL[asset.type]} ·{" "}
                          {new Intl.DateTimeFormat("en-US", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(asset.createdAt))}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="connections-panel">
              <div className="panel-heading">
                <div>
                  <h2>Connected stack</h2>
                  <p>Shopify and team access for this workspace.</p>
                </div>
              </div>
              <div className="connection-links">
                <button
                  className="manage-button"
                  onClick={() => router.push("/commerce")}
                >
                  Shopify stores <Icon name="arrow" size={16} />
                </button>
                <button
                  className="manage-button"
                  onClick={() => router.push("/settings")}
                >
                  Team members <Icon name="arrow" size={16} />
                </button>
              </div>
            </div>
          </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
