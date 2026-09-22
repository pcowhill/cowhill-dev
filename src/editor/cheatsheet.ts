/**
 * The Markdown cheat sheet shown under the description field. Every entry
 * describes what the shared renderer (src/shared/markdown.ts) actually does
 * with the syntax, including the constructs it refuses, so the sheet never
 * promises formatting the website cannot show.
 */
import { escapeHtml as e } from '../shared/html.ts';

export interface CheatSheetEntry {
  /** What to type. Multi-line examples are shown as a block. */
  syntax: string;
  /** What appears on the website. */
  result: string;
}

export interface CheatSheetSection {
  title: string;
  entries: CheatSheetEntry[];
}

export function markdownCheatSheet(projectId: string): CheatSheetSection[] {
  const id = projectId || 'my-project';
  return [
    {
      title: 'Text',
      entries: [
        { syntax: 'One paragraph.\n\nAnother paragraph.', result: 'Paragraphs are separated by a blank line. A single line break inside a paragraph is ignored.' },
        { syntax: 'First line\\\nSecond line', result: 'A backslash (or two trailing spaces) at the end of a line forces a line break inside a paragraph.' },
        { syntax: '**bold** *italic* ~~struck~~', result: 'Bold, italic and strikethrough text.' },
        { syntax: '\\*literal asterisks\\*', result: 'A backslash shows a Markdown character literally instead of formatting.' },
      ],
    },
    {
      title: 'Headings',
      entries: [
        { syntax: '# Section', result: 'A section heading. Headings are shifted one level down so they never compete with the project title.' },
        { syntax: '## Subsection', result: 'A smaller heading inside a section.' },
      ],
    },
    {
      title: 'Lists',
      entries: [
        { syntax: '- First item\n- Second item\n  - Nested item', result: 'A bulleted list (* also works). Indent two spaces to nest.' },
        { syntax: '1. First step\n2. Second step', result: 'A numbered list.' },
        { syntax: '- [x] Done\n- [ ] Still to do', result: 'A task list with read-only checkboxes.' },
      ],
    },
    {
      title: 'Links and images',
      entries: [
        { syntax: '[Link text](https://example.com/)', result: 'A link. Addresses outside this site open in a new tab with an automatic icon.' },
        { syntax: `[Read the notes](project-assets/${id}/notes.pdf)`, result: 'A link to a file in this project’s asset folder. Only http(s), mailto:, #fragment and project-assets/… destinations are allowed.' },
        { syntax: `![Alt text](project-assets/${id}/figure.png)`, result: 'An image from this project’s asset folder, with alternative text for screen readers. Remote images are rejected.' },
        { syntax: '<https://example.com/>', result: 'A bare address becomes a link automatically.' },
      ],
    },
    {
      title: 'Code and quotes',
      entries: [
        { syntax: '`inline code`', result: 'Inline code in a monospace font.' },
        { syntax: '```python\nprint("hello")\n```', result: 'A code block. The language name is optional and is kept for styling, but code is not colour-highlighted.' },
        { syntax: '> Quoted text', result: 'A block quote.' },
        { syntax: '---', result: 'A horizontal rule between sections.' },
      ],
    },
    {
      title: 'Tables',
      entries: [
        { syntax: '| Feature | Status |\n| --- | --- |\n| Export | done |\n| Undo | planned |', result: 'A table. The second line separates the header row from the body.' },
      ],
    },
    {
      title: 'Not supported',
      entries: [
        { syntax: '$E = mc^2$', result: 'LaTeX-style math is not rendered; it appears exactly as typed. Write formulas with Unicode characters (x², √2, π, ≤) or as inline code instead.' },
        { syntax: '<b>tag</b>', result: 'Raw HTML is rejected by validation and would be shown as plain text.' },
        { syntax: '![Remote](https://example.com/pic.png)', result: 'Remote images are rejected; copy the file into project-assets/ instead.' },
        { syntax: 'Footnotes[^1]', result: 'Footnotes are not supported; the marker is shown as text.' },
      ],
    },
  ];
}

/** The cheat sheet as a collapsed disclosure styled like the catalog's status legend. */
export function renderCheatSheet(projectId: string, options: { open?: boolean } = {}): string {
  const sections = markdownCheatSheet(projectId)
    .map(
      (section) => `<h5 class="md-cheatsheet__title">${e(section.title)}</h5>
<dl>${section.entries
        .map((entry) => {
          const block = entry.syntax.includes('\n');
          const code = `<code>${e(entry.syntax)}</code>`;
          return `<dt>${block ? `<pre>${code}</pre>` : code}</dt><dd>${e(entry.result)}</dd>`;
        })
        .join('')}</dl>`,
    )
    .join('\n');
  return `<details class="legend md-cheatsheet" id="f-md-cheatsheet"${options.open ? ' open' : ''}>
  <summary>Markdown cheat sheet</summary>
  <p class="md-cheatsheet__intro">Type the syntax on the left in the description; the website shows the result on the right. Check the Detail page preview to see it rendered.</p>
  ${sections}
</details>`;
}
