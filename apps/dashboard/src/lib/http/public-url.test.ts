import { describe, expect, it, vi } from "vitest";
import {
  assertPublicHttpUrl,
  fetchPublicText,
  htmlToText,
  type LookupAll,
} from "./public-url";

const publicLookup: LookupAll = async () => [
  { address: "93.184.215.14", family: 4 },
];

describe("assertPublicHttpUrl", () => {
  it.each([
    "http://127.0.0.1/",
    "http://169.254.169.254/",
    "http://10.0.0.1/",
    "http://192.168.1.10/",
    "http://172.20.0.1/",
    "http://[::1]/",
    "http://[fe80::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://localhost/",
    "ftp://example.com/",
    "file:///etc/passwd",
    "http://user:pass@example.com/",
  ])("rejects %s", async (url) => {
    await expect(assertPublicHttpUrl(url, publicLookup)).rejects.toThrow(
      "That URL is not allowed.",
    );
  });

  it("rejects a hostname that resolves to a private address", async () => {
    const lookup: LookupAll = async () => [
      { address: "93.184.215.14", family: 4 },
      { address: "10.1.2.3", family: 4 },
    ];
    await expect(
      assertPublicHttpUrl("https://internal.example.com/", lookup),
    ).rejects.toThrow("That URL is not allowed.");
  });

  it("accepts a public https URL without touching the network", async () => {
    const lookup = vi.fn(publicLookup);
    const parsed = await assertPublicHttpUrl("https://example.com/", lookup);
    expect(parsed.hostname).toBe("example.com");
    expect(lookup).toHaveBeenCalledWith("example.com");
  });
});

describe("fetchPublicText", () => {
  it("re-checks redirect targets", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data" },
      }),
    );
    await expect(
      fetchPublicText("https://example.com/", {
        lookup: publicLookup,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow("That URL is not allowed.");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("stops after three redirects", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(null, {
        status: 301,
        headers: { location: "https://example.com/next" },
      }),
    );
    await expect(
      fetchPublicText("https://example.com/", {
        lookup: publicLookup,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow("That URL is not allowed.");
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("returns page text without markup", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        "<html><script>alert(1)</script><h1>Title</h1><p>Body &amp; more</p></html>",
        { headers: { "content-type": "text/html" } },
      ),
    );
    const text = await fetchPublicText("https://example.com/", {
      lookup: publicLookup,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(text).toBe("Title\nBody & more");
  });
});

describe("htmlToText", () => {
  it("drops style blocks", () => {
    expect(htmlToText("<style>p{}</style><p>Hi</p>")).toBe("Hi");
  });
});
