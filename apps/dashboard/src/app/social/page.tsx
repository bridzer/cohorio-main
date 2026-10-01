"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
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

type SavedPost = {
  id: string;
  platform: Platform;
  body: string;
  scheduledFor: string | null;
  status: "draft" | "scheduled" | "published";
  createdAt: string;
};

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
  const [savedPosts, setSavedPosts] = useState<SavedPost[]>([]);
  const [postIds, setPostIds] = useState<Partial<Record<Platform, string>>>({});
  const [saving, setSaving] = useState(false);

  const draftCount = savedPosts.filter((post) => post.status === "draft").length;
  const scheduledCount = savedPosts.filter(
    (post) => post.status === "scheduled",
  ).length;
  const publishedCount = savedPosts.filter(
    (post) => post.status === "published",
  ).length;

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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/social/posts", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { posts?: SavedPost[] };
        if (!cancelled) setSavedPosts(payload.posts ?? []);
      } catch {
        // Saved posts stay empty until the API responds.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
        saved?: SavedPost[];
        error?: string;
      };
      if (!response.ok || !payload.posts) {
        throw new Error(payload.error || "Unable to generate posts.");
      }
      setPosts((current) => ({ ...current, ...payload.posts }));
      if (payload.saved?.length) {
        setSavedPosts((current) => [...payload.saved!, ...current]);
        setPostIds((current) => {
          const next = { ...current };
          for (const post of payload.saved ?? []) next[post.platform] = post.id;
          return next;
        });
      }
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

  async function saveDraft() {
    if (!activePost.trim() || saving) return;
    setSaving(true);
    setGenerateError("");
    try {
      const response = await fetch("/api/social/posts", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: activePlatform,
          body: activePost,
          sourcePrompt: source,
        }),
      });
      const payload = (await response.json()) as {
        post?: SavedPost;
        error?: string;
      };
      if (!response.ok || !payload.post) {
        throw new Error(payload.error || "Unable to save this draft.");
      }
      setSavedPosts((current) => [payload.post!, ...current]);
      setPostIds((current) => ({
        ...current,
        [activePlatform]: payload.post!.id,
      }));
      setView("Library");
    } catch (error) {
      setGenerateError(
        error instanceof Error ? error.message : "Unable to save this draft.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function scheduleActivePost() {
    if (saving) return;
    setSaving(true);
    setGenerateError("");
    try {
      let id = postIds[activePlatform];
      if (!id) {
        if (!activePost.trim()) return;
        const created = await fetch("/api/social/posts", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platform: activePlatform,
            body: activePost,
            sourcePrompt: source,
          }),
        });
        const createdPayload = (await created.json()) as {
          post?: SavedPost;
          error?: string;
        };
        if (!created.ok || !createdPayload.post) {
          throw new Error(createdPayload.error || "Unable to save this post.");
        }
        id = createdPayload.post.id;
        setSavedPosts((current) => [createdPayload.post!, ...current]);
      }
      const when = new Date();
      when.setDate(when.getDate() + 1);
      when.setHours(10, 0, 0, 0);
      const response = await fetch(`/api/social/posts/${id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "scheduled",
          scheduledFor: when.toISOString(),
        }),
      });
      const payload = (await response.json()) as {
        post?: SavedPost;
        error?: string;
      };
      if (!response.ok || !payload.post) {
        throw new Error(payload.error || "Unable to schedule this post.");
      }
      setSavedPosts((current) => {
        const next = current.filter((post) => post.id !== payload.post!.id);
        return [payload.post!, ...next];
      });
      setPostIds((current) => ({
        ...current,
        [activePlatform]: payload.post!.id,
      }));
      setScheduled(true);
    } catch (error) {
      setGenerateError(
        error instanceof Error ? error.message : "Unable to schedule this post.",
      );
    } finally {
      setSaving(false);
    }
  }

  const calendarGroups = useMemo(() => {
    const groups = new Map<string, SavedPost[]>();
    for (const post of savedPosts) {
      if (!post.scheduledFor) continue;
      const day = post.scheduledFor.slice(0, 10);
      groups.set(day, [...(groups.get(day) ?? []), post]);
    }
    return [...groups.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    );
  }, [savedPosts]);

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
              {label === "Calendar" && scheduledCount > 0 && (
                <span className="social-count">{scheduledCount}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="social-sidebar-spacer" />

        <div className="social-plan">
          <span>Saved posts</span>
          <strong>
            {draftCount} drafts · {scheduledCount} scheduled
          </strong>
          <div>
            <i />
          </div>
          <small>{publishedCount} published</small>
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
            <button className="social-connect" type="button">
              <span className="social-live-dot" />
              {savedPosts.length} saved posts
            </button>
            <button className="social-primary" onClick={() => setView("Calendar")}>
              <Glyph size={16}>{icons.calendar}</Glyph>
              View calendar
            </button>
          </div>
        </header>

        <div className="social-content">
          {view === "Calendar" ? (
            <section className="social-saved-panel">
              <h2>Calendar</h2>
              {calendarGroups.length ? (
                calendarGroups.map(([day, postsForDay]) => (
                  <div key={day} className="social-saved-group">
                    <h3>
                      {new Intl.DateTimeFormat("en-US", {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        timeZone: "UTC",
                      }).format(new Date(`${day}T00:00:00Z`))}
                    </h3>
                    {postsForDay.map((post) => (
                      <article key={post.id}>
                        <strong>{post.platform}</strong>
                        <p>{post.body}</p>
                      </article>
                    ))}
                  </div>
                ))
              ) : (
                <p>No scheduled posts yet.</p>
              )}
            </section>
          ) : view === "Library" ? (
            <section className="social-saved-panel">
              <h2>Library</h2>
              {savedPosts.some((post) => post.status === "draft") ? (
                savedPosts
                  .filter((post) => post.status === "draft")
                  .map((post) => (
                    <article key={post.id}>
                      <strong>{post.platform}</strong>
                      <p>{post.body}</p>
                    </article>
                  ))
              ) : (
                <p>No drafts yet.</p>
              )}
            </section>
          ) : view === "Analytics" ? (
            <section className="social-saved-panel">
              <h2>Analytics</h2>
              <div className="social-analytics-counts">
                <article>
                  <span>Drafts</span>
                  <strong>{draftCount}</strong>
                </article>
                <article>
                  <span>Scheduled</span>
                  <strong>{scheduledCount}</strong>
                </article>
                <article>
                  <span>Published</span>
                  <strong>{publishedCount}</strong>
                </article>
              </div>
            </section>
          ) : (
          <>
          <section className="social-title-row">
            <div>
              <span className="social-kicker">Create once. Adapt everywhere.</span>
              <h1>Your social content studio</h1>
              <p>
                Turn a rough idea, article, or transcript into posts shaped for
                every platform.
              </p>
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
                      {account?.access.organizationName ?? "Cohorio"}
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
                  type="button"
                  disabled={saving}
                  onClick={() => void saveDraft()}
                >
                  {saving ? "Saving..." : "Save draft"}
                </button>
                <button
                  className={`social-schedule ${scheduled ? "scheduled" : ""}`}
                  type="button"
                  disabled={saving}
                  onClick={() => void scheduleActivePost()}
                >
                  <Glyph size={16}>
                    {scheduled ? icons.check : icons.calendar}
                  </Glyph>
                  {scheduled ? "Scheduled for tomorrow, 10:00" : "Schedule post"}
                </button>
              </div>
            </div>
          </section>

          <section className="social-lower-grid">
            <div className="social-calendar-card">
              <div className="social-card-heading">
                <div>
                  <h2>Scheduled</h2>
                  <p>
                    {scheduledCount} scheduled · {draftCount} drafts
                  </p>
                </div>
                <button onClick={() => setView("Calendar")}>
                  Open calendar <Glyph size={15}>{icons.chevron}</Glyph>
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
