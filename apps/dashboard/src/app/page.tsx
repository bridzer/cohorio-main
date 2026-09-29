"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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
];

const tasks: {
  title: string;
  description: string;
  icon: IconName;
  category: string;
  tone: string;
  skill: string;
}[] = [
  {
    title: "Create social content",
    description: "Turn one idea into platform-ready posts that sound like your brand.",
    icon: "social",
    category: "Content",
    tone: "coral",
    skill: "social-content",
  },
  {
    title: "Generate ad creative",
    description: "Build and test campaign angles, headlines, and variations at scale.",
    icon: "ads",
    category: "Ads",
    tone: "violet",
    skill: "ad-creative",
  },
  {
    title: "Write conversion copy",
    description: "Create clear, persuasive copy for landing pages and product launches.",
    icon: "copy",
    category: "Content",
    tone: "blue",
    skill: "copywriting",
  },
  {
    title: "Audit a landing page",
    description: "Find the friction, weak claims, and missed opportunities hurting conversion.",
    icon: "target",
    category: "Optimize",
    tone: "lime",
    skill: "page-cro",
  },
  {
    title: "Plan an email sequence",
    description: "Map a welcome, nurture, launch, or win-back flow from goal to send.",
    icon: "mail",
    category: "Lifecycle",
    tone: "amber",
    skill: "email-sequence",
  },
  {
    title: "Run an SEO audit",
    description: "Prioritize technical, on-page, and content fixes with the highest impact.",
    icon: "search",
    category: "Optimize",
    tone: "cyan",
    skill: "seo-audit",
  },
];

const activity = [
  {
    title: "LinkedIn launch sequence",
    type: "Social content",
    time: "18 min ago",
    status: "Ready",
  },
  {
    title: "Q3 demand-gen angles",
    type: "Ad creative",
    time: "Yesterday",
    status: "Draft",
  },
  {
    title: "Homepage positioning audit",
    type: "CRO report",
    time: "Aug 9",
    status: "Ready",
  },
];

type DashboardAccount = {
  user: { name?: string | null; email?: string | null };
  access: {
    organizationName: string;
    workspaceName: string;
    role: string;
  };
};

export default function Home() {
  const router = useRouter();
  const [activeNav, setActiveNav] = useState("Overview");
  const [filter, setFilter] = useState("All");
  const [prompt, setPrompt] = useState("");
  const [brandBrainProgress, setBrandBrainProgress] = useState(0);
  const [account, setAccount] = useState<DashboardAccount | null>(null);
  const [assistantMessage, setAssistantMessage] = useState(
    "What are we working on today?",
  );

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

  const displayName = account?.user.name?.trim() || "there";
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const filteredTasks = useMemo(
    () =>
      filter === "All" ? tasks : tasks.filter((task) => task.category === filter),
    [filter],
  );

  function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) return;
    setAssistantMessage(
      `I’ll turn “${cleanPrompt}” into a focused marketing workflow. Connect an AI provider to run it end-to-end.`,
    );
    setPrompt("");
  }

  function selectTask(task: (typeof tasks)[number]) {
    if (task.skill === "social-content") {
      router.push("/social");
      return;
    }
    setActiveNav("Ask Cohorio");
    setAssistantMessage(
      `${task.title} is ready. I’ll use the ${task.skill} playbook and your product context to guide the work.`,
    );
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
                if (item.label === "Commerce") {
                  router.push("/commerce");
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
          <section className="welcome-row">
            <div>
              <p className="eyebrow">Wednesday, August 12</p>
              <h1>Good morning, {displayName.split(/\s+/)[0]}.</h1>
              <p>Your marketing workspace is ready. What will you move forward today?</p>
            </div>
            <div className="usage-pill">
              <div className="usage-ring">
                <span>7</span>
              </div>
              <div>
                <strong>7 of 50 tasks</strong>
                <span>Renews Sep 1</span>
              </div>
              <Icon name="arrow" size={16} />
            </div>
          </section>

          <section className="copilot-card">
            <div className="copilot-glow" />
            <div className="copilot-icon">
              <Icon name="spark" size={23} />
            </div>
            <div className="copilot-copy">
              <span className="copilot-label">Cohorio co-pilot</span>
              <h2>{assistantMessage}</h2>
              <p>
                Ask for a campaign, audit, sequence, strategy, or anything else
                on your marketing list.
              </p>
              <form onSubmit={submitPrompt}>
                <input
                  aria-label="Ask Cohorio"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Try “Turn our latest blog post into a LinkedIn campaign”"
                />
                <button type="submit" aria-label="Send prompt">
                  <Icon name="send" size={18} />
                </button>
              </form>
              <div className="quick-prompts">
                <button onClick={() => setPrompt("Plan this week’s social content")}>
                  Plan my week
                </button>
                <button onClick={() => setPrompt("Review my homepage positioning")}>
                  Review my homepage
                </button>
                <button onClick={() => setPrompt("Find my highest-impact marketing task")}>
                  What should I do next?
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

          <section className="tasks-section">
            <div className="section-heading">
              <div>
                <h2>Start with a playbook</h2>
                <p>Expert workflows, grounded in your brand context.</p>
              </div>
              <div className="filters" aria-label="Task filters">
                {["All", "Content", "Ads", "Optimize", "Lifecycle"].map((item) => (
                  <button
                    key={item}
                    className={filter === item ? "active" : ""}
                    onClick={() => setFilter(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div className="task-grid">
              {filteredTasks.map((task) => (
                <button
                  className="task-card"
                  key={task.title}
                  onClick={() => selectTask(task)}
                >
                  <span className={`task-icon ${task.tone}`}>
                    <Icon name={task.icon} size={22} />
                  </span>
                  <span className="task-copy">
                    <strong>{task.title}</strong>
                    <span>{task.description}</span>
                  </span>
                  <span className="task-arrow">
                    <Icon name="arrow" size={17} />
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="bottom-grid">
            <div className="activity-panel">
              <div className="panel-heading">
                <div>
                  <h2>Recent work</h2>
                  <p>Pick up where you left off.</p>
                </div>
                <button>View all</button>
              </div>
              <div className="activity-list">
                {activity.map((item, index) => (
                  <button key={item.title} className="activity-row">
                    <span className={`file-tile file-${index + 1}`}>
                      <span />
                      <span />
                      <span />
                    </span>
                    <span className="activity-copy">
                      <strong>{item.title}</strong>
                      <span>
                        {item.type} · {item.time}
                      </span>
                    </span>
                    <span className={`status ${item.status.toLowerCase()}`}>
                      {item.status === "Ready" && <Icon name="check" size={13} />}
                      {item.status}
                    </span>
                    <Icon name="arrow" size={16} />
                  </button>
                ))}
              </div>
            </div>

            <div className="connections-panel">
              <div className="panel-heading">
                <div>
                  <h2>Connected stack</h2>
                  <p>Bring performance into every decision.</p>
                </div>
              </div>
              <div className="connection-icons">
                <span className="connection ga">A</span>
                <span className="connection stripe">S</span>
                <span className="connection mailchimp">M</span>
                <button className="add-connection" aria-label="Add connection">
                  <Icon name="plus" size={19} />
                </button>
              </div>
              <div className="connection-summary">
                <span className="pulse-dot" />
                <p>
                  <strong>3 sources are healthy</strong>
                  Last synced 4 minutes ago
                </p>
              </div>
              <button className="manage-button">
                Manage connections <Icon name="arrow" size={16} />
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
