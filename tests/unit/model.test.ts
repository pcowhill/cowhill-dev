import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { EditorModel } from '../../src/editor/model.ts';

const source = fs.readFileSync('tests/fixtures/roundtrip.yaml', 'utf8');

describe('EditorModel round trips', () => {
  it('reproduces the file byte-for-byte when nothing changes', () => {
    const { model } = EditorModel.fromText(source);
    expect(model!.toText()).toBe(source);
  });

  it('preserves comments, quoting, unicode, block scalars and order across an edit', () => {
    const { model } = EditorModel.fromText(source);
    model!.setScalar([1, 'summary'], 'Changed summary');
    const out = model!.toText();
    expect(out).toContain('# Header comment line one\n# Header comment line two\n');
    expect(out).toContain('  # Comment above the first project\n');
    expect(out).toContain('tags: [alpha, beta] # trailing comment on tags');
    expect(out).toContain('      # comment inside links\n');
    expect(out).toContain('title: "Quoted: title with colon"');
    expect(out).toContain("title: 'Single quoted'");
    expect(out).toContain('summary: Ünïcödé summary — with dashes and emoji 🐄');
    expect(out).toContain('description: |\n      Line one.\n\n      Line two with `code`.\n');
    expect(out).toContain('summary: Changed summary');
    expect(out).toContain('notice: ""');
    expect(out.indexOf('id: first')).toBeLessThan(out.indexOf('id: second'));
    // Only the intended line changed.
    const diff = out.split('\n').filter((line, i) => line !== source.split('\n')[i]);
    expect(diff).toEqual(['    summary: Changed summary']);
  });

  it('writes multiline text as block literals and removes cleared optional fields', () => {
    const { model } = EditorModel.fromText(source);
    model!.setScalar([1, 'description'], 'One\n\nTwo');
    model!.setScalar([0, 'notice'], undefined);
    model!.setScalar([0, 'description'], 'single line now');
    const out = model!.toText();
    expect(out).toContain('    description: |\n      One\n\n      Two\n');
    expect(out).not.toContain('notice:');
    expect(out).toContain('description: single line now');
  });

  it('keeps flow style for tags and supports list edits', () => {
    const { model } = EditorModel.fromText(source);
    model!.setStringList([0, 'tags'], ['gamma', 'Delta Force']);
    model!.addListItem(0, 'links', { label: 'Docs', url: 'https://example.org/docs' });
    model!.moveListItem(0, 'links', 2, -1);
    model!.setPrimaryLink(0, 1);
    model!.removeListItem(0, 'links', 0);
    const out = model!.toText();
    expect(out).toContain('tags: [gamma, Delta Force] # trailing comment on tags');
    const links = (model!.getField(0, 'links') as Record<string, unknown>[]).map((l) => `${l.label}${l.primary ? '*' : ''}`);
    expect(links).toEqual(['Docs*', 'Source']);
  });

  it('adds, duplicates, moves and removes projects as drafts with unique ids', () => {
    const { model } = EditorModel.fromText(source);
    const added = model!.addProject({ id: model!.uniqueId('first'), title: 'New', summary: '', tags: [], status: 'active', draft: true });
    expect(model!.ids()).toEqual(['first', 'second', 'first-2']);
    const dup = model!.duplicateProject(0);
    expect(dup).toBe(1);
    expect(model!.ids()).toEqual(['first', 'first-copy', 'second', 'first-2']);
    expect(model!.getField(1, 'draft')).toBe(true);
    expect(model!.getField(1, 'title')).toBe('Quoted: title with colon');
    expect(model!.moveProject(added + 1, -1)).toBe(2);
    model!.removeProject(0);
    expect(model!.ids()).toEqual(['first-copy', 'first-2', 'second']);
    const out = model!.toText();
    expect(out).toContain('# Header comment line one');
    expect(EditorModel.fromText(out).model).not.toBeNull();
  });

  it('reports unknown fields and keeps them verbatim', () => {
    const text = 'schemaVersion: 1\nprojects:\n  - id: a\n    title: A\n    summary: s\n    tags: []\n    status: active\n    mystery: keep me # note\n';
    const { model } = EditorModel.fromText(text);
    expect(model!.snapshots()[0]?.unknownFields).toEqual(['mystery']);
    model!.setScalar([0, 'title'], 'B');
    expect(model!.toText()).toContain('mystery: keep me # note');
    expect(model!.validate().errors[0]?.message).toMatch(/unknown field "mystery"/);
  });

  it('rejects invalid YAML and duplicate keys', () => {
    expect(EditorModel.fromText('projects: [\n').model).toBeNull();
    expect(EditorModel.fromText('schemaVersion: 1\nschemaVersion: 2\nprojects: []\n').errors[0]?.message).toMatch(/unique/i);
    expect(EditorModel.fromText('- just a list\n').errors[0]?.message).toMatch(/must be a mapping/);
  });

  it('survives repeated open/edit/save cycles', () => {
    let text = source;
    for (let i = 0; i < 5; i += 1) {
      const { model } = EditorModel.fromText(text);
      model!.setScalar([0, 'title'], `Cycle ${i}`);
      text = model!.toText();
    }
    expect(text).toContain('title: "Cycle 4"'); // the authored double-quoted style is preserved
    expect(text).toContain('# Header comment line two');
    expect(text.split('# comment inside links').length).toBe(2);
    expect(EditorModel.fromText(text).model!.toText()).toBe(text);
  });
});
