"use client";

import { useEffect } from "react";

/**
 * The app is opened inside the Shopify admin iframe after a store connects.
 * Authentication must not happen in that frame: browsers restrict
 * third-party cookies there, which breaks the Auth.js CSRF and session
 * cookies (sign-in fails with MissingCSRF, and Safari/Firefox block the
 * cookies even in CHIPS-partitioned form). When an auth page detects it is
 * embedded, it sends the top-level window to the same page, so the merchant
 * signs in first-party and then returns to the embedded app. AuthShell
 * renders this on every auth page; it is a no-op in a normal browser tab.
 */
export function EscapeIframe() {
  useEffect(() => {
    if (window.self === window.top) return;
    try {
      window.top?.location.assign(window.location.href);
    } catch {
      // A sandboxed frame can forbid top-level navigation. The page then
      // remains a normal sign-in form; only the embedded session is limited.
    }
  }, []);
  return null;
}
