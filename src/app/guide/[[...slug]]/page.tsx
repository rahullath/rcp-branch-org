import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import "./guide.css";

/*
 * The guide: docs/*.md rendered at /guide/<name>, public, built at deploy
 * time. The Markdown is kept to what these pages use (headings, paragraphs,
 * lists, tables, code blocks, bold, code and links), so no parser library.
 */

const DOCS = join(process.cwd(), "docs");
const ORDER = ["index", "start-a-branch", "officers", "privacy", "how-it-works", "run-your-own", "contributing"];

type Params = { params: Promise<{ slug?: string[] }> };

export function generateStaticParams() {
  return readdirSync(DOCS)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""))
    .map((name) => ({ slug: name === "index" ? [] : [name] }));
}

function load(slug?: string[]): string | null {
  const name = slug?.[0] ?? "index";
  if (slug && slug.length > 1) return null;
  if (!/^[a-z-]+$/.test(name)) return null;
  try {
    return readFileSync(join(DOCS, `${name}.md`), "utf8");
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const md = load((await params).slug);
  const title = md?.match(/^# (.+)$/m)?.[1] ?? "Guide";
  return { title: `${title} · Branch Organizer guide` };
}

export default async function GuidePage({ params }: Params) {
  const { slug } = await params;
  const md = load(slug);
  if (!md) notFound();
  const current = slug?.[0] ?? "index";
  const titles = ORDER.map((name) => ({ name, title: load(name === "index" ? undefined : [name])?.match(/^# (.+)$/m)?.[1] ?? name }));
  return (
    <div className="guide">
      <nav className="guide-nav" aria-label="Guide">
        {titles.map((t) => (
          <Link key={t.name} href={t.name === "index" ? "/guide" : `/guide/${t.name}`} aria-current={t.name === current ? "page" : undefined}>
            {t.name === "index" ? "Overview" : t.title}
          </Link>
        ))}
      </nav>
      <article className="guide-body">{render(md)}</article>
    </div>
  );
}

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = out.length;
    if (m[1]) out.push(<strong key={k}>{inline(m[1])}</strong>);
    else if (m[2]) out.push(<code key={k}>{m[2]}</code>);
    else if (m[4].startsWith("/")) out.push(<Link key={k} href={m[4]}>{m[3]}</Link>);
    else out.push(<a key={k} href={m[4]} target="_blank" rel="noopener noreferrer">{m[3]}</a>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (row: string) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

function render(md: string): ReactNode[] {
  const lines = md.split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const k = out.length;
    if (!line.trim()) {
      i++;
    } else if (line.startsWith("```")) {
      const body: string[] = [];
      for (i++; i < lines.length && !lines[i].startsWith("```"); i++) body.push(lines[i]);
      i++;
      out.push(<pre key={k}>{body.join("\n")}</pre>);
    } else if (/^#{1,3} /.test(line)) {
      const level = line.indexOf(" ");
      const text = inline(line.slice(level + 1));
      out.push(level === 1 ? <h1 key={k}>{text}</h1> : level === 2 ? <h2 key={k}>{text}</h2> : <h3 key={k}>{text}</h3>);
      i++;
    } else if (line.startsWith("|")) {
      const rows: string[][] = [];
      for (; i < lines.length && lines[i].startsWith("|"); i++) if (!/^\|[\s-|]+\|$/.test(lines[i].trim())) rows.push(cells(lines[i]));
      const [head, ...body] = rows;
      out.push(
        <div key={k} className="guide-table">
          <table>
            <thead>
              <tr>{head.map((c, j) => <th key={j}>{inline(c)}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((r, n) => (
                <tr key={n}>{r.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    } else if (/^(\d+\.|-) /.test(line)) {
      const ordered = /^\d+\./.test(line);
      const items: string[] = [];
      for (; i < lines.length && /^(\d+\.|-) /.test(lines[i]); i++) items.push(lines[i].replace(/^(\d+\.|-) /, ""));
      const lis = items.map((t, n) => <li key={n}>{inline(t)}</li>);
      out.push(ordered ? <ol key={k}>{lis}</ol> : <ul key={k}>{lis}</ul>);
    } else {
      const para: string[] = [];
      for (; i < lines.length && lines[i].trim() && !/^(#|```|\||\d+\. |- )/.test(lines[i]); i++) para.push(lines[i]);
      out.push(<p key={k}>{inline(para.join(" "))}</p>);
    }
  }
  return out;
}
