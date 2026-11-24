import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Markdown, parseMarkdown } from '@/features/legal/render-markdown';

describe('parseMarkdown', () => {
  it('parses headings, wrapped paragraphs and lists', () => {
    expect(
      parseMarkdown('# Título\n\nUna línea\nque sigue.\n\n- uno\n- dos\n\n1. a\n2. b'),
    ).toEqual([
      { type: 'heading', level: 1, text: 'Título' },
      { type: 'paragraph', text: 'Una línea que sigue.' },
      { type: 'ul', items: ['uno', 'dos'] },
      { type: 'ol', items: ['a', 'b'] },
    ]);
  });
});

describe('Markdown', () => {
  it('renders inline formatting and safe links', () => {
    const html = renderToStaticMarkup(
      <Markdown source={'Texto **fuerte**, *énfasis*, `código` y [enlace](https://ejemplo.pe).'} />,
    );
    expect(html).toContain('<strong>fuerte</strong>');
    expect(html).toContain('<em>énfasis</em>');
    expect(html).toContain('<code>código</code>');
    expect(html).toContain('href="https://ejemplo.pe"');
  });

  it('never interprets raw HTML nor unsafe link schemes', () => {
    const html = renderToStaticMarkup(
      <Markdown
        source={'<script>alert(1)</script> [x](javascript:alert(1)) <img src=x onerror=y>'}
      />,
    );
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('href="javascript');
    expect(html).toContain('&lt;script&gt;');
  });

  it('shifts heading levels', () => {
    expect(renderToStaticMarkup(<Markdown source="# Uno" headingOffset={1} />)).toContain('<h2');
  });
});
