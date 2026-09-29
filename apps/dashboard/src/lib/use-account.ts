"use client";

import { useEffect, useState } from "react";

export type AccountSummary = {
  user: { name?: string | null; email?: string | null };
  access: {
    organizationName: string;
    workspaceName: string;
    role: string;
  };
};

export function useAccount() {
  const [account, setAccount] = useState<AccountSummary | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/account", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as AccountSummary;
        if (!cancelled) setAccount(data);
      } catch {
        // Protected APIs still enforce identity when summary loading fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return account;
}

export function accountInitials(account: AccountSummary | null) {
  return (account?.user.name || account?.user.email || "User")
    .split(/[\s@]+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
