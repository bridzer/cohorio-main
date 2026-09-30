"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useMemo, useState } from "react";
import { accountInitials, useAccount } from "@/lib/use-account";
import "./social.css";

type Platform = "LinkedIn" | "X" | "Instagram";
type View = "Create" | "Calendar" | "Library" | "Analytics";

function Glyph({
  children,
  size = 20,
}: {
  children: ReactNode;
  size?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const icons = {
  home: (
    <>
      <path d="m3 11 9-8 9 8" />
      <path d="M5 10v10h14V10M9 20v-6h6v6" />
    </>
  ),
  create: (
    <>
      <path d="m12 3-1.1 3.2a7.4 7.4 0 0 1-4.7 4.7L3 12l3.2 1.1a7.4 7.4 0 0 1 4.7 4.7L12 21l1.1-3.2a7.4 7.4 0 0 1 4.7-4.7L21 12l-3.2-1.1a7.4 7.4 0 0 1-4.7-4.7L12 3Z" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </>
  ),
  library: (
    <>
      <path d="M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4Z" />
      <path d="M8 8h7M8 12h5" />
    </>
  ),
  analytics: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1A7 7 0 0 0 15 6.2L14.7 3h-4l-.4 3.2a7 7 0 0 0-1.5.9l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 1.5.9l.4 3.2h4l.4-3.2a7 7 0 0 0 1.5-.9l2.4 1 2-3.4-2-1.5a7 7 0 0 0 .1-1Z" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M5 20h14" />
    </>
  ),
  send: (
    <>
      <path d="m22 2-7 20-4-9-9-4 20-7Z" />
      <path d="M22 2 11 13" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-5-5L5 20" />
    </>
  ),
  magic: (
    <>
      <path d="m15 4 5 5L8 21l-5-5L15 4Z" />
      <path d="m6 13 5 5M19 2v3M22 5h-3" />
    </>
  ),
  chevron: <path d="m9 18 6-6-6-6" />,
  check: <path d="m5 12 4 4L19 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
};

const platforms: Platform[] = ["LinkedIn", "X", "Instagram"];

const platformConfig: Record<
  Platform,
  { mark: string; className: string; limit: number }
> = {
  LinkedIn: { mark: "in", className: "linkedin", limit: 3000 },
  X: { mark: "𝕏", className: "x", limit: 280 },
  Instagram: { mark: "◎", className: "instagram", limit: 2200 },
};

const emptyPosts: Record<Platform, string> = {
  LinkedIn: "",
  X: "",
  Instagram: "",
};

const week = [
  {
    day: "Mon",
    date: "10",
    posts: [
      { time: "9:30", title: "The context gap", platform: "in", tone: "blue" },
      { time: "14:00", title: "3 hooks to test", platform: "𝕏", tone: "ink" },
    ],
  },
  {
    day: "Tue",
    date: "11",
    posts: [
      { time: "11:00", title: "Build in public", platform: "◎", tone: "pink" },
    ],
  },
  {
    day: "Wed",
    date: "12",
    current: true,
    posts: [
      { time: "10:00", title: "Why voice drifts", platform: "in", tone: "blue" },
      { time: "16:30", title: "Founder lesson", platform: "𝕏", tone: "ink" },
    ],
  },
  { day: "Thu", date: "13", posts: [] },
  {
    day: "Fri",
    date: "14",
    posts: [
      { time: "9:00", title: "Weekly teardown", platform: "in", tone: "blue" },
    ],
  },
];

const pillars = [
  { label: "Industry insight", percent: 30, color: "#5f8de4" },
  { label: "Build in public", percent: 25, color: "#e2795f" },
  { label: "Practical education", percent: 25, color: "#75a56d" },
  { label: "Customer stories", percent: 15, color: "#9a79cf" },
  { label: "Product", percent: 5, color: "#d5a54a" },
];

function BrandMark() {
  return (
    <span className="social-brand-mark" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

export default function SocialStudio() {
  const account = useAccount();
  const [view, setView] = useState<View>("Create");
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([
    "LinkedIn",
    "X",
  ]);
  const [activePlatform, setActivePlatform] =
    useState<Platform>("LinkedIn");
  const [source, setSource] = useState(
    "One shared brand brain turns scattered product knowledge into consistent marketing. Teams can create faster without losing their voice.",
  );
  const [posts, setPosts] = useState(emptyPosts);
  const [tone, setTone] = useState("Clear & insightful");
  const [scheduled, setScheduled] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");

  const activePost = posts[activePlatform];
  const charCount = activePost.length;
  const currentLimit = platformConfig[activePlatform].limit;

  const selectedLabel = useMemo(
    () =>
      selectedPlatforms.length === platforms.length
        ? "all platforms"
        : selectedPlatforms.join(" and "),
    [selectedPlatforms],
  );

  function togglePlatform(platform: Platform) {
    setSelectedPlatforms((current) => {
      if (current.includes(platform)) {
        if (current.length === 1) return current;
        const next = current.filter((item) => item !== platform);
        if (platform === activePlatform) setActivePlatform(next[0]);
        return next;
      }
      return [...current, platform];
    });
  }

  async function generate(event: FormEvent) {
    event.preventDefault();
    if (!source.trim() || generating) return;
    setGenerating(true);
    setGenerateError("");
    setScheduled(false);
    try {
      const response = await fetch("/api/social/generate", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: source.trim(),
          platforms: selectedPlatforms,
          tone,
        }),
      });
      const payload = (await response.json()) as {
        posts?: Partial<Record<Platform, string>>;
        error?: string;
      };
      if (!response.ok || !payload.posts) {
        throw new Error(payload.error || "Unable to generate posts.");
      }
      setPosts((current) => ({ ...current, ...payload.posts }));
      const nextPlatform = selectedPlatforms[0];
      if (nextPlatform && !selectedPlatforms.includes(activePlatform)) {
        setActivePlatform(nextPlatform);
      }
    } catch (error) {
      setGenerateError(
        error instanceof Error ? error.message : "Unable to generate posts.",
      );
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="social-shell">
      <aside className="social-sidebar">
        <Link href="/" className="social-brand">
          <BrandMark />
          <span>Cohorio</span>
        </Link>

        <div className="social-workspace">
          <span>
            {account?.access.workspaceName?.[0]?.toUpperCase() ?? "W"}
          </span>
          <div>
            <strong>{account?.access.workspaceName ?? "Workspace"}</strong>
            <small>{account?.access.organizationName ?? "Social workspace"}</small>
          </div>
          <b>⌄</b>
        </div>

        <nav>
          <p>Social studio</p>
          {(
            [
              ["Create", icons.create],
              ["Calendar", icons.calendar],
              ["Library", icons.library],
              ["Analytics", icons.analytics],
            ] as [View, ReactNode][]
          ).map(([label, icon]) => (
            <button
              key={label}
              className={view === label ? "active" : ""}
              onClick={() => setView(label)}
            >
              <Glyph size={18}>{icon}</Glyph>
              {label}
              {label === "Calendar" && <span className="social-count">6</span>}
            </button>
          ))}
        </nav>

        <div className="social-sidebar-spacer" />

        <div className="social-plan">
          <span>Weekly rhythm</span>
          <strong>6 of 9 posts ready</strong>
          <div>
            <i />
          </div>
          <small>3 open slots this week</small>
        </div>

        <Link href="/" className="social-back">
          <Glyph size={18}>{icons.home}</Glyph>
          Main dashboard
        </Link>
        <Link href="/settings" className="social-settings">
          <Glyph size={18}>{icons.settings}</Glyph>
          Settings
        </Link>
        <div className="social-user">
          <span>{accountInitials(account)}</span>
          <div>
            <strong>{account?.user.name ?? "Cohorio user"}</strong>
            <small>{account?.user.email ?? "Signed in"}</small>
          </div>
          <b>•••</b>
        </div>
      </aside>

      <main className="social-main">
        <header className="social-topbar">
          <div className="social-mobile-brand">
            <BrandMark />
            Cohorio
          </div>
          <div className="social-breadcrumb">
            <span>Social Studio</span>
            <b>/</b>
            <strong>{view}</strong>
          </div>
          <div className="social-top-actions">
            <button className="social-connect">
              <span className="social-live-dot" />
              3 channels connected
            </button>
            <button className="social-primary" onClick={() => setView("Calendar")}>
              <Glyph size={16}>{icons.calendar}</Glyph>
              View calendar
            </button>
          </div>
        </header>

        <div className="social-content">
          <section className="social-title-row">
            <div>
              <span className="social-kicker">Create once. Adapt everywhere.</span>
              <h1>Your social content studio</h1>
              <p>
                Turn a rough idea, article, or transcript into posts shaped for
                every platform.
              </p>
            </div>
            <div className="social-week-switch">
              <button aria-label="Previous week">‹</button>
              <span>Aug 10 – 14</span>
              <button aria-label="Next week">›</button>
            </div>
          </section>

          <section className="social-studio-grid">
            <div className="social-composer">
              <div className="social-panel-title">
                <span className="social-step">01</span>
                <div>
                  <h2>Start with an idea</h2>
                  <p>Paste source material or describe what you want to say.</p>
                </div>
              </div>

              <form onSubmit={generate}>
                <div className="social-source-box">
                  <textarea
                    aria-label="Source content"
                    value={source}
                    onChange={(event) => setSource(event.target.value)}
                    placeholder="Paste a blog URL, transcript, newsletter, or rough idea..."
                  />
                  <div className="social-source-actions">
                    <button type="button">
                      <Glyph size={15}>{icons.link}</Glyph>
                      Add URL
                    </button>
                    <button type="button">
                      <Glyph size={15}>{icons.upload}</Glyph>
                      Upload
                    </button>
                    <span>{source.length} characters</span>
                  </div>
                </div>

                <div className="social-field">
                  <label>Publish to</label>
                  <div className="social-platform-select">
                    {platforms.map((platform) => {
                      const config = platformConfig[platform];
                      const selected = selectedPlatforms.includes(platform);
                      return (
                        <button
                          type="button"
                          key={platform}
                          className={selected ? "selected" : ""}
                          onClick={() => togglePlatform(platform)}
                        >
                          <span className={config.className}>{config.mark}</span>
                          {platform}
                          {selected && (
                            <i>
                              <Glyph size={11}>{icons.check}</Glyph>
                            </i>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="social-two-fields">
                  <label>
                    Goal
                    <select defaultValue="Build authority">
                      <option>Build authority</option>
                      <option>Drive engagement</option>
                      <option>Generate leads</option>
                      <option>Drive traffic</option>
                    </select>
                  </label>
                  <label>
                    Voice
                    <select value={tone} onChange={(e) => setTone(e.target.value)}>
                      <option>Clear & insightful</option>
                      <option>Bold & contrarian</option>
                      <option>Warm & conversational</option>
                      <option>Concise & tactical</option>
                    </select>
                  </label>
                </div>

                <div className="social-field">
                  <label>Content pillar</label>
                  <div className="social-pillar-choice">
                    <button type="button" className="selected">
                      <i style={{ background: pillars[0].color }} />
                      Industry insight
                    </button>
                    <button type="button">
                      <i style={{ background: pillars[2].color }} />
                      Practical education
                    </button>
                    <button type="button" className="social-more-pillars">
                      +3
                    </button>
                  </div>
                </div>

                <button
                  className="social-generate"
                  type="submit"
                  disabled={generating || !source.trim()}
                >
                  <Glyph size={18}>{icons.magic}</Glyph>
                  {generating
                    ? "Shaping your posts..."
                    : `Generate for ${selectedLabel}`}
                  <span>⌘ ↵</span>
                </button>
                {generateError ? (
                  <p className="social-generate-error" role="alert">
                    {generateError}
                  </p>
                ) : null}
              </form>
            </div>

            <div className="social-preview-panel">
              <div className="social-preview-heading">
                <div>
                  <span className="social-step">02</span>
                  <h2>Review & refine</h2>
                </div>
                <span className="social-draft-label">Draft</span>
              </div>

              <div className="social-preview-tabs">
                {platforms.map((platform) => {
                  const config = platformConfig[platform];
                  return (
                    <button
                      key={platform}
                      disabled={!selectedPlatforms.includes(platform)}
                      className={activePlatform === platform ? "active" : ""}
                      onClick={() => setActivePlatform(platform)}
                    >
                      <span className={config.className}>{config.mark}</span>
                      {platform}
                    </button>
                  );
                })}
              </div>

              <div className="social-post-card">
                <div className="social-post-author">
                  <span className="social-author-avatar">AK</span>
                  <div>
                    <strong>{account?.user.name ?? "Cohorio user"}</strong>
                    <small>
                      {account?.access.organizationName ?? "Cohorio"} · 1m
                    </small>
                  </div>
                  <b>•••</b>
                </div>
                <textarea
                  aria-label={`${activePlatform} post`}
                  value={activePost}
                  onChange={(event) =>
                    setPosts((current) => ({
                      ...current,
                      [activePlatform]: event.target.value,
                    }))
                  }
                />
                <button className="social-add-visual">
                  <span>
                    <Glyph size={19}>{icons.image}</Glyph>
                  </span>
                  <div>
                    <strong>Add a visual</strong>
                    <small>Generate a carousel, image, or quote card</small>
                  </div>
                  <Glyph size={16}>{icons.chevron}</Glyph>
                </button>
                <div className="social-post-meta">
                  <span>Voice: {tone}</span>
                  <span className={charCount > currentLimit ? "over" : ""}>
                    {charCount.toLocaleString()} / {currentLimit.toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="social-preview-actions">
                <button
                  className="social-secondary"
                  onClick={() => setView("Library")}
                >
                  Save draft
                </button>
                <button
                  className={`social-schedule ${scheduled ? "scheduled" : ""}`}
                  onClick={() => setScheduled(true)}
                >
                  <Glyph size={16}>
                    {scheduled ? icons.check : icons.calendar}
                  </Glyph>
                  {scheduled ? "Scheduled for Wed, 10:00" : "Schedule post"}
                </button>
              </div>
            </div>
          </section>

          <section className="social-lower-grid">
            <div className="social-calendar-card">
              <div className="social-card-heading">
                <div>
                  <h2>This week</h2>
                  <p>6 scheduled posts · 3 open slots</p>
                </div>
                <button onClick={() => setView("Calendar")}>
                  Open calendar <Glyph size={15}>{icons.chevron}</Glyph>
                </button>
              </div>
              <div className="social-mini-calendar">
                {week.map((day) => (
                  <div
                    key={day.day}
                    className={`social-day ${day.current ? "current" : ""}`}
                  >
                    <div className="social-day-heading">
                      <span>{day.day}</span>
                      <strong>{day.date}</strong>
                    </div>
                    <div className="social-day-posts">
                      {day.posts.map((post) => (
                        <button key={`${day.day}-${post.time}`}>
                          <span className={`social-platform-mini ${post.tone}`}>
                            {post.platform}
                          </span>
                          <span>
                            <strong>{post.title}</strong>
                            <small>{post.time}</small>
                          </span>
                        </button>
                      ))}
                      {day.posts.length === 0 && (
                        <button className="social-empty-slot">
                          <Glyph size={14}>{icons.plus}</Glyph>
                          Add post
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <aside className="social-pillars-card">
              <div className="social-card-heading">
                <div>
                  <h2>Content mix</h2>
                  <p>Your target pillar balance</p>
                </div>
                <button aria-label="Edit content mix">Edit</button>
              </div>
              <div className="social-pillar-bar">
                {pillars.map((pillar) => (
                  <span
                    key={pillar.label}
                    style={{
                      width: `${pillar.percent}%`,
                      background: pillar.color,
                    }}
                  />
                ))}
              </div>
              <div className="social-pillar-list">
                {pillars.map((pillar) => (
                  <div key={pillar.label}>
                    <i style={{ background: pillar.color }} />
                    <span>{pillar.label}</span>
                    <strong>{pillar.percent}%</strong>
                  </div>
                ))}
              </div>
            </aside>
          </section>
        </div>
      </main>
    </div>
  );
}
