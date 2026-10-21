import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown, safeHref } from "./markdown";
import { parseSseFrames, readEventStream } from "./sse";
import { toolLabel } from "./labels";

describe("parseSseFrames", () => {
  it("parses complete frames and keeps a partial one for the next chunk", () => {
    const { messages, rest } = parseSseFrames(
      'event: tool_start\ndata: {"tool":"load_skill"}\n\nevent: done\ndata: {"ok"',
    );
    expect(messages).toEqual([{ event: "tool_start", data: { tool: "load_skill" } }]);
    expect(rest).toBe('event: done\ndata: {"ok"');
  });

  it("reads events split across arbitrary network chunks", async () => {
    const text = 'event: thread\ndata: {"threadId":"t1"}\n\nevent: done\r\ndata: {"ok":true}\r\n\r\n';
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let index = 0; index < text.length; index += 7) {
          controller.enqueue(encoder.encode(text.slice(index, index + 7)));
        }
        controller.close();
      },
    });
    const seen: string[] = [];
    await readEventStream(body, (message) => seen.push(message.event));
    expect(seen).toEqual(["thread", "done"]);
  });
});

describe("markdown", () => {
  it("only allows http(s) and same-site links", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,hi")).toBeNull();
    expect(safeHref("//evil.test/x")).toBeNull();
    expect(safeHref("/social")).toBe("/social");
    expect(safeHref("https://example.com/a")).toBe("https://example.com/a");
    expect(parseInline("[click](javascript:alert)")).toEqual([{ type: "text", text: "click" }]);
    expect(parseInline("[click](javascript:alert(1))").some((node) => node.type === "link")).toBe(false);
  });

  it("parses inline emphasis, code and links", () => {
    expect(parseInline("Use **bold _and em_** with `code` and [docs](/library).")).toEqual([
      { type: "text", text: "Use " },
      { type: "strong", children: [
        { type: "text", text: "bold " },
        { type: "em", children: [{ type: "text", text: "and em" }] },
      ] },
      { type: "text", text: " with " },
      { type: "code", text: "code" },
      { type: "text", text: " and " },
      { type: "link", href: "/library", children: [{ type: "text", text: "docs" }] },
      { type: "text", text: "." },
    ]);
  });

  it("parses headings, lists, tables, code and quotes", () => {
    const blocks = parseMarkdown([
      "## Plan",
      "Intro line",
      "continues here.",
      "",
      "- one",
      "  - nested",
      "1. first",
      "",
      "| Headline | Chars |",
      "|---|---:|",
      "| Stop guessing | 13 |",
      "",
      "```",
      "<script>x</script>",
      "```",
      "> quoted",
      "---",
    ].join("\n"));
    expect(blocks.map((block) => block.type)).toEqual([
      "heading", "paragraph", "list", "list", "table", "code", "quote", "hr",
    ]);
    expect(blocks[1]).toEqual({
      type: "paragraph", children: [{ type: "text", text: "Intro line continues here." }],
    });
    expect(blocks[2]).toMatchObject({ ordered: false, items: [{ depth: 0 }, { depth: 1 }] });
    expect(blocks[4]).toMatchObject({ rows: [[[{ text: "Stop guessing" }], [{ text: "13" }]]] });
    expect(blocks[5]).toEqual({ type: "code", language: "", text: "<script>x</script>" });
  });
});

describe("toolLabel", () => {
  it("names skills for playbook steps and humanizes unknown tools", () => {
    expect(toolLabel("load_skill", { skill: "ad-creative" })).toBe("Loaded a playbook · ad-creative");
    expect(toolLabel("some_new_tool")).toBe("some new tool");
  });
});
