import type { ReactNode } from "react";

/**
 * Markdown — a tiny hand-rolled renderer for the docs we ship
 * (headings, lists, tables, blockquotes, bold/italic/code, links).
 * Deliberately small: the data card and threat model are written
 * against exactly this subset, and no heavy markdown dependency is
 * worth its bundle for two pages.
 */

function inline(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const token = m[0];
    const key = `${keyPrefix}-${k++}`;
    if (token.startsWith("**")) {
      parts.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*")) {
      parts.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("`")) {
      parts.push(
        <code key={key} className="rounded bg-paper px-1 py-0.5 font-mono text-[0.85em]">
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      const linkMatch = token.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        parts.push(
          <a key={key} href={linkMatch[2]} className="text-accent underline underline-offset-2">
            {linkMatch[1]}
          </a>,
        );
      } else {
        parts.push(token);
      }
    }
    last = m.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function Markdown({ source }: { source: string }) {
  const lines = source.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  const isTableRow = (l: string) => l.trim().startsWith("|") && l.trim().endsWith("|");
  const cells = (l: string) => l.trim().slice(1, -1).split("|").map((c) => c.trim());

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const content = inline(heading[2], `h${key}`);
      if (level === 1) blocks.push(<h1 key={key++} className="mt-2 text-[24px] font-bold tracking-tight">{content}</h1>);
      else if (level === 2) blocks.push(<h2 key={key++} className="mt-7 border-b border-rule pb-1.5 text-[18px] font-semibold tracking-tight">{content}</h2>);
      else if (level === 3) blocks.push(<h3 key={key++} className="mt-5 text-[15.5px] font-semibold">{content}</h3>);
      else blocks.push(<h4 key={key++} className="mt-4 text-[14px] font-semibold">{content}</h4>);
      i += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      blocks.push(<hr key={key++} className="my-5 border-rule" />);
      i += 1;
      continue;
    }

    if (isTableRow(line) && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1].trim())) {
      const header = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(cells(lines[i]));
        i += 1;
      }
      blocks.push(
        <div key={key++} className="my-4 overflow-x-auto rounded border border-rule">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-rule bg-paper text-left">
                {header.map((h, hi) => (
                  <th key={hi} className="px-3 py-2 font-semibold">{inline(h, `th${key}-${hi}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-b border-rule last:border-b-0">
                  {r.map((c, ci) => (
                    <td key={ci} className="px-3 py-2 align-top">{inline(c, `td${key}-${ri}-${ci}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push(
        <blockquote key={key++} className="my-4 border-l-2 border-accent bg-paper px-4 py-3 text-[13.5px] leading-relaxed">
          {inline(quoteLines.join(" "), `q${key}`)}
        </blockquote>,
      );
      continue;
    }

    if (/^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      const ordered = /^\d+\.\s+/.test(trimmed);
      const items: string[] = [];
      while (i < lines.length && (/^[-*]\s+/.test(lines[i].trim()) || /^\d+\.\s+/.test(lines[i].trim()))) {
        items.push(lines[i].trim().replace(/^([-*]|\d+\.)\s+/, ""));
        i += 1;
      }
      const ListTag = ordered ? "ol" : "ul";
      blocks.push(
        <ListTag key={key++} className={`my-3 space-y-1.5 pl-5 text-[14px] leading-relaxed ${ordered ? "list-decimal" : "list-disc"}`}>
          {items.map((item, ii) => (
            <li key={ii}>{inline(item, `li${key}-${ii}`)}</li>
          ))}
        </ListTag>,
      );
      continue;
    }

    // Paragraph: gather until a blank line or a block start.
    const para: string[] = [trimmed];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4})\s+/.test(lines[i].trim()) &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith(">") &&
      !isTableRow(lines[i])
    ) {
      para.push(lines[i].trim());
      i += 1;
    }
    blocks.push(
      <p key={key++} className="my-3 text-[14px] leading-relaxed">
        {inline(para.join(" "), `p${key}`)}
      </p>,
    );
  }

  return <div>{blocks}</div>;
}
