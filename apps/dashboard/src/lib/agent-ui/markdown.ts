// A small Markdown subset for agent answers. It produces a plain data tree
// that React renders as elements, so model output never becomes raw HTML.

export type Inline =
  | { type: "text"; text: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: Inline[] };

export type Block =
  | { type: "heading"; level: 1 | 2 | 3 | 4; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "list"; ordered: boolean; items: { depth: number; children: Inline[] }[] }
  | { type: "code"; language: string; text: string }
  | { type: "quote"; children: Inline[] }
  | { type: "table"; header: Inline[][]; rows: Inline[][][] }
  | { type: "hr" };

/** Allows absolute http(s) URLs and same-site paths; everything else renders as text. */
export function safeHref(href: string) {
  const value = href.trim();
  if (/^\/(?!\/)/.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*|__[^_\n]+?__)|(\*[^*\s][^*\n]*?\*|_[^_\s][^_\n]*?_)|(\[[^\]\n]+\]\([^)\s]+\))/;

export function parseInline(text: string): Inline[] {
  const nodes: Inline[] = [];
  let rest = text;
  while (rest) {
    const match = INLINE.exec(rest);
    if (!match) {
      nodes.push({ type: "text", text: rest });
      break;
    }
    if (match.index > 0) nodes.push({ type: "text", text: rest.slice(0, match.index) });
    const token = match[0];
    if (match[1]) {
      nodes.push({ type: "code", text: token.slice(1, -1) });
    } else if (match[2]) {
      nodes.push({ type: "strong", children: parseInline(token.slice(2, -2)) });
    } else if (match[3]) {
      nodes.push({ type: "em", children: parseInline(token.slice(1, -1)) });
    } else {
      const label = token.slice(1, token.indexOf("]("));
      const href = safeHref(token.slice(token.indexOf("](") + 2, -1));
      nodes.push(
        href
          ? { type: "link", href, children: parseInline(label) }
          : { type: "text", text: label },
      );
    }
    rest = rest.slice(match.index + token.length);
  }
  return nodes;
}

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const TABLE_DIVIDER = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function tableCells(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => parseInline(cell.trim()));
}

export function parseMarkdown(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) {
      blocks.push({ type: "paragraph", children: parseInline(paragraph.join(" ")) });
      paragraph = [];
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      flush();
      continue;
    }
    const fence = /^(```|~~~)\s*([\w-]*)/.exec(trimmed);
    if (fence) {
      flush();
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith(fence[1])) {
        body.push(lines[index]);
        index += 1;
      }
      blocks.push({ type: "code", language: fence[2], text: body.join("\n") });
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flush();
      const level = Math.min(heading[1].length, 4) as 1 | 2 | 3 | 4;
      blocks.push({ type: "heading", level, children: parseInline(heading[2].replace(/\s+#+$/, "")) });
      continue;
    }
    if (/^([-*_])(\s*\1){2,}$/.test(trimmed)) {
      flush();
      blocks.push({ type: "hr" });
      continue;
    }
    if (trimmed.includes("|") && TABLE_DIVIDER.test(lines[index + 1]?.trim() ?? "")) {
      flush();
      const header = tableCells(trimmed);
      const rows: Inline[][][] = [];
      index += 2;
      while (index < lines.length && lines[index].trim().includes("|")) {
        rows.push(tableCells(lines[index]));
        index += 1;
      }
      index -= 1;
      blocks.push({ type: "table", header, rows });
      continue;
    }
    if (trimmed.startsWith(">")) {
      flush();
      const quoted: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quoted.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      index -= 1;
      blocks.push({ type: "quote", children: parseInline(quoted.join(" ")) });
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      flush();
      const ordered = /\d/.test(item[2]);
      const items: { depth: number; children: Inline[] }[] = [];
      while (index < lines.length) {
        const current = LIST_ITEM.exec(lines[index]);
        if (current && !current[1] && items.length && /\d/.test(current[2]) !== ordered) {
          break; // A top-level switch between bullets and numbers starts a new list.
        }
        if (current) {
          items.push({
            depth: Math.min(Math.floor(current[1].replace(/\t/g, "  ").length / 2), 3),
            children: parseInline(current[3]),
          });
        } else if (lines[index].trim() && /^\s{2,}/.test(lines[index]) && items.length) {
          // Indented continuation of the previous item.
          items[items.length - 1].children.push(
            { type: "text", text: " " },
            ...parseInline(lines[index].trim()),
          );
        } else {
          break;
        }
        index += 1;
      }
      index -= 1;
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    paragraph.push(trimmed);
  }
  flush();
  return blocks;
}
