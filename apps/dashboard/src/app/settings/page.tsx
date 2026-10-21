"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import "./settings.css";

type AccountData = {
  user: { id: string; name?: string | null; email?: string | null };
  access: {
    userId: string;
    organizationId: string;
    organizationName: string;
    workspaceId: string;
    workspaceName: string;
    role: "owner" | "admin" | "member" | "viewer";
  };
  workspaces: Array<{
    id: string;
    organizationId: string;
    organizationName: string;
    name: string;
    isDefault: boolean;
  }>;
  members: Array<{
    userId: string;
    name: string | null;
    email: string;
    role: "owner" | "admin" | "member" | "viewer";
    status: "active" | "suspended";
  }>;
};

export default function SettingsPage() {
  const [data, setData] = useState<AccountData | null>(null);
  const [name, setName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [billing, setBilling] = useState<{
    plan: "free" | "pro" | "team";
    used: number;
    limit: number | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/billing", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as {
          plan: "free" | "pro" | "team";
          used: number;
          limit: number | null;
        };
        if (!cancelled) setBilling(payload);
      })
      .catch(() => {
        // The plan card stays hidden until billing loads.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function checkout(plan: "pro" | "team") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "Unable to start checkout.");
      }
      window.location.assign(payload.url);
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Unable to start checkout.",
      );
      setBusy(false);
    }
  }

  async function load() {
    const response = await fetch("/api/account", { cache: "no-store" });
    const payload = (await response.json()) as AccountData & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Unable to load settings.");
    setData(payload);
    setName(payload.user.name ?? "");
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/account", { cache: "no-store" });
        const payload = (await response.json()) as AccountData & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load settings.");
        }
        if (!cancelled) {
          setData(payload);
          setName(payload.user.name ?? "");
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to load settings.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function request(
    url: string,
    options: RequestInit,
    successMessage: string,
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(url, {
        ...options,
        headers: { "Content-Type": "application/json", ...options.headers },
      });
      const payload = (await response.json()) as {
        error?: string;
        developmentUrl?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Request failed.");
      setNotice(
        payload.developmentUrl
          ? `${successMessage} Local link: ${payload.developmentUrl}`
          : successMessage,
      );
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Request failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <main className="settings-loading">
        <p>{error || "Loading account settings…"}</p>
      </main>
    );
  }

  const canAdmin = data.access.role === "owner" || data.access.role === "admin";

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
          <span>Account and access</span>
          <h1>Workspace settings</h1>
          <p>
            Manage your profile, organization members, and active marketing
            workspace.
          </p>
        </div>
        {error && <p className="settings-error">{error}</p>}
        {notice && <p className="settings-notice">{notice}</p>}

        <section className="settings-card">
          <div>
            <h2>Profile</h2>
            <p>{data.user.email}</p>
          </div>
          <form
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void request(
                "/api/account",
                { method: "PATCH", body: JSON.stringify({ name }) },
                "Profile updated.",
              );
            }}
          >
            <label>
              Display name
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <button disabled={busy}>Save profile</button>
          </form>
        </section>

        <section className="settings-card">
          <div>
            <h2>Workspaces</h2>
            <p>{data.access.organizationName}</p>
          </div>
          <div className="settings-list">
            {data.workspaces.map((workspace) => (
              <div className="settings-row" key={workspace.id}>
                <span>
                  <strong>{workspace.name}</strong>
                  <small>{workspace.organizationName}</small>
                </span>
                {workspace.id === data.access.workspaceId ? (
                  <em>Active</em>
                ) : (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void request(
                        "/api/workspaces/active",
                        {
                          method: "PUT",
                          body: JSON.stringify({ workspaceId: workspace.id }),
                        },
                        "Workspace switched.",
                      )
                    }
                  >
                    Switch
                  </button>
                )}
              </div>
            ))}
          </div>
          {canAdmin && (
            <form
              className="settings-inline-form"
              onSubmit={(event) => {
                event.preventDefault();
                void request(
                  "/api/workspaces",
                  {
                    method: "POST",
                    body: JSON.stringify({ name: workspaceName }),
                  },
                  "Workspace created.",
                ).then(() => setWorkspaceName(""));
              }}
            >
              <input
                placeholder="New workspace name"
                value={workspaceName}
                onChange={(event) => setWorkspaceName(event.target.value)}
                required
              />
              <button disabled={busy}>Create workspace</button>
            </form>
          )}
        </section>

        <section className="settings-card">
          <div>
            <h2>Organization members</h2>
            <p>Your role: {data.access.role}</p>
          </div>
          <div className="settings-list">
            {data.members.map((member) => (
              <div className="settings-row" key={member.userId}>
                <span>
                  <strong>{member.name || member.email}</strong>
                  <small>{member.email}</small>
                </span>
                {data.access.role === "owner" &&
                member.userId !== data.access.userId ? (
                  <select
                    value={member.role}
                    disabled={busy}
                    onChange={(event) =>
                      void request(
                        `/api/members/${member.userId}`,
                        {
                          method: "PATCH",
                          body: JSON.stringify({ role: event.target.value }),
                        },
                        "Member role updated.",
                      )
                    }
                  >
                    <option value="owner">Owner</option>
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </select>
                ) : (
                  <em>{member.role}</em>
                )}
              </div>
            ))}
          </div>
          {canAdmin && (
            <form
              className="settings-inline-form invite"
              onSubmit={(event) => {
                event.preventDefault();
                void request(
                  "/api/invitations",
                  {
                    method: "POST",
                    body: JSON.stringify({
                      email: inviteEmail,
                      role: inviteRole,
                    }),
                  },
                  "Invitation created.",
                ).then(() => setInviteEmail(""));
              }}
            >
              <input
                type="email"
                placeholder="teammate@example.com"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                required
              />
              <select
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value)}
              >
                <option value="admin">Admin</option>
                <option value="member">Member</option>
                <option value="viewer">Viewer</option>
              </select>
              <button disabled={busy}>Invite member</button>
            </form>
          )}
        </section>

        {billing && (
          <section className="settings-card">
            <div>
              <h2>Plan</h2>
              <p>
                {billing.plan === "free"
                  ? `Free plan · ${billing.used} of ${billing.limit} tasks used this month (UTC)`
                  : `${billing.plan === "pro" ? "Pro" : "Team"} plan · ${billing.used} tasks this month · no task cap`}
              </p>
            </div>
            {billing.plan === "free" ? (
              <div className="settings-plan-actions">
                <button disabled={busy} onClick={() => void checkout("pro")}>
                  Upgrade to Pro · $49/month
                </button>
                <button disabled={busy} onClick={() => void checkout("team")}>
                  Upgrade to Team · $149/month
                </button>
              </div>
            ) : null}
          </section>
        )}

        <section className="settings-card">
          <div>
            <h2>Marketing tools</h2>
            <p>Connect Resend, GA4, ad networks, and other tools for this workspace.</p>
          </div>
          <Link href="/settings/integrations" className="settings-back">
            Manage connections
          </Link>
        </section>

        <section className="settings-card danger">
          <div>
            <h2>Security</h2>
            <p>Revoke access when you suspect a session has been exposed.</p>
          </div>
          <div className="settings-security-actions">
            <button
              disabled={busy}
              onClick={() =>
                void request(
                  "/api/account",
                  {
                    method: "POST",
                    body: JSON.stringify({ action: "revoke-sessions" }),
                  },
                  "All sessions revoked.",
                ).then(() => void signOut({ callbackUrl: "/sign-in" }))
              }
            >
              Sign out all devices
            </button>
            <button onClick={() => void signOut({ callbackUrl: "/sign-in" })}>
              Sign out
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
