import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { parseMarkdown, type Block, type Inline } from "@/lib/agent-ui/markdown";

function renderInline(nodes: Inline[], keyPrefix = ""): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}${index}`;
    switch (node.type) {
      case "text":
        return node.text;
      case "strong":
        return <strong key={key}>{renderInline(node.children, `${key}.`)}</strong>;
      case "em":
        return <em key={key}>{renderInline(node.children, `${key}.`)}</em>;
      case "code":
        return <code key={key}>{node.text}</code>;
      case "link":
        return node.href.startsWith("/") ? (
          <Link key={key} href={node.href}>
            {renderInline(node.children, `${key}.`)}
          </Link>
        ) : (
          <a key={key} href={node.href} target="_blank" rel="noopener noreferrer nofollow">
            {renderInline(node.children, `${key}.`)}
          </a>
        );
    }
  });
}

function renderBlock(block: Block, index: number) {
  switch (block.type) {
    case "heading": {
      const Tag = (["h3", "h3", "h4", "h5"] as const)[block.level - 1];
      return <Tag key={index}>{renderInline(block.children)}</Tag>;
    }
    case "paragraph":
      return <p key={index}>{renderInline(block.children)}</p>;
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag key={index}>
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex} style={{ marginLeft: `${item.depth * 1.25}rem` }}>
              {renderInline(item.children)}
            </li>
          ))}
        </Tag>
      );
    }
    case "code":
      return (
        <pre key={index}>
          <code>{block.text}</code>
        </pre>
      );
    case "quote":
      return <blockquote key={index}>{renderInline(block.children)}</blockquote>;
    case "table":
      return (
        <div className="agent-table-wrap" key={index}>
          <table>
            <thead>
              <tr>
                {block.header.map((cell, cellIndex) => (
                  <th key={cellIndex}>{renderInline(cell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{renderInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "hr":
      return <hr key={index} />;
  }
}

export function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return <div className="agent-markdown">{blocks.map(renderBlock)}</div>;
}
