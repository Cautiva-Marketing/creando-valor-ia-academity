import type { ReactNode } from 'react';

/**
 * Minimal Markdown subset for legal documents, without raw HTML and without a new dependency:
 * headings (#..###), paragraphs, `-`/`*` and `1.` lists, **bold**, *italic*, `code` and
 * [links](https://… | mailto:… | /path). Everything is rendered as React text, so any HTML in the
 * source is shown escaped, never interpreted.
 */

type Block =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'ul' | 'ol'; items: string[] };

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null;

  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
    if (list) blocks.push(list);
    paragraph = [];
    list = null;
  };

  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: 'heading', level: heading[1]!.length as 1 | 2 | 3, text: heading[2]! });
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const ordered = /^\d+\.\s+(.*)$/.exec(line);
    const item = bullet ?? ordered;
    if (item) {
      const type = bullet ? 'ul' : 'ol';
      if (paragraph.length || (list && list.type !== type)) flush();
      list ??= { type, items: [] };
      list.items.push(item[1]!);
      continue;
    }
    if (list) {
      // Continuation line of the last list item.
      const items = list.items;
      items[items.length - 1] = `${items[items.length - 1]} ${line}`;
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return blocks;
}

const INLINE = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\))/g;
const SAFE_HREF = /^(https?:\/\/|mailto:|\/(?!\/))/i;

export function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const [, , bold, italic, code, linkText, href] = match;
    if (bold !== undefined) nodes.push(<strong key={key++}>{bold}</strong>);
    else if (italic !== undefined) nodes.push(<em key={key++}>{italic}</em>);
    else if (code !== undefined) nodes.push(<code key={key++}>{code}</code>);
    else if (linkText !== undefined && href !== undefined) {
      nodes.push(
        SAFE_HREF.test(href) ? (
          <a key={key++} href={href} className="text-primary underline underline-offset-4">
            {linkText}
          </a>
        ) : (
          linkText
        ),
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** `headingOffset` shifts heading levels (e.g. 1 when the page already has its own h1). */
export function Markdown({
  source,
  headingOffset = 0,
}: {
  source: string;
  headingOffset?: number;
}) {
  return (
    <div className="flex flex-col gap-4 leading-relaxed">
      {parseMarkdown(source).map((block, index) => {
        switch (block.type) {
          case 'heading': {
            const level = Math.min(block.level + headingOffset, 6);
            const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
            const size = level <= 1 ? 'text-3xl' : level === 2 ? 'text-2xl' : 'text-xl';
            return (
              <Tag key={index} className={`${size} mt-2`}>
                {renderInline(block.text)}
              </Tag>
            );
          }
          case 'ul':
          case 'ol': {
            const List = block.type;
            return (
              <List
                key={index}
                className={`flex flex-col gap-1 ps-6 ${block.type === 'ul' ? 'list-disc' : 'list-decimal'}`}
              >
                {block.items.map((item, i) => (
                  <li key={i}>{renderInline(item)}</li>
                ))}
              </List>
            );
          }
          default:
            return <p key={index}>{renderInline(block.text)}</p>;
        }
      })}
    </div>
  );
}
