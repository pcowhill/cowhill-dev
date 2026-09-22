/**
 * Editor document model: a thin layer over the `yaml` Document API so that
 * form edits become targeted node updates and comments, ordering, and
 * untouched values survive a save unchanged.
 */
import { Document, Scalar, YAMLMap, YAMLSeq, isMap, isNode, isScalar, isSeq, type Node, type Pair } from 'yaml';
import { parseYamlText, getProjectsSeq, YAML_STRINGIFY_OPTIONS } from '../shared/yaml-doc.ts';
import { validateCatalog, type AssetReference, type ValidationIssue, type ValidationResult } from '../shared/validate.ts';
import { PROJECT_FIELDS, SCHEMA_VERSION, type ProjectField } from '../shared/schema.ts';

export interface ProjectSnapshot {
  index: number;
  id: string;
  title: string;
  draft: boolean;
  status: string;
  /** Fields present in YAML that the schema does not know about. */
  unknownFields: string[];
  /** Raw (unvalidated) plain-object view of the record. */
  raw: Record<string, unknown>;
}

export type ScalarValue = string | number | boolean;

export class EditorModel {
  private doc: Document.Parsed | Document;
  /** ids as they were when the document was loaded (index -> id, draft). */
  private readonly loadedIdentity = new Map<YAMLMap, { id: string; draft: boolean }>();

  private constructor(doc: Document.Parsed | Document) {
    this.doc = doc;
    for (const node of this.projectNodes()) {
      const id = node.get('id');
      const draft = node.get('draft');
      this.loadedIdentity.set(node, { id: typeof id === 'string' ? id : '', draft: draft === true });
    }
  }

  /** Parses text; returns the model or the parse errors. */
  static fromText(text: string): { model: EditorModel | null; errors: ValidationIssue[]; warnings: ValidationIssue[] } {
    const parsed = parseYamlText(text);
    if (!parsed.document) return { model: null, errors: parsed.errors, warnings: parsed.warnings };
    const root = parsed.document.contents;
    if (!isMap(root)) {
      return {
        model: null,
        errors: [{ path: '', message: 'the document must be a mapping with "schemaVersion" and "projects"', level: 'error' }],
        warnings: parsed.warnings,
      };
    }
    return { model: new EditorModel(parsed.document), errors: [], warnings: parsed.warnings };
  }

  /** A fresh, empty catalog document. */
  static empty(): EditorModel {
    const doc = new Document({ schemaVersion: SCHEMA_VERSION, projects: [] });
    doc.commentBefore = ' cowhill.dev project catalog. See README.md for the field reference.';
    return new EditorModel(doc);
  }

  toText(): string {
    return this.doc.toString(YAML_STRINGIFY_OPTIONS);
  }

  toJS(): unknown {
    return this.doc.toJS({ maxAliasCount: 100 });
  }

  validate(checkAsset?: (ref: AssetReference) => string | null): ValidationResult {
    return validateCatalog(this.toJS(), checkAsset ? { checkAsset } : {});
  }

  private seq(): YAMLSeq {
    return getProjectsSeq(this.doc);
  }

  private projectNodes(): YAMLMap[] {
    const seq = this.doc.contents && isMap(this.doc.contents) ? this.doc.contents.get('projects', true) : null;
    if (!isSeq(seq)) return [];
    return seq.items.filter((item): item is YAMLMap => isMap(item));
  }

  get count(): number {
    return this.seq().items.length;
  }

  node(index: number): YAMLMap | null {
    const item = this.seq().items[index];
    return isMap(item) ? item : null;
  }

  snapshots(): ProjectSnapshot[] {
    return this.seq().items.map((item, index) => {
      if (!isMap(item)) {
        return { index, id: '', title: `(invalid entry #${index + 1})`, draft: false, status: '', unknownFields: [], raw: {} };
      }
      const raw = item.toJS(this.doc) as Record<string, unknown>;
      const unknown = Object.keys(raw).filter((key) => !(PROJECT_FIELDS as readonly string[]).includes(key));
      return {
        index,
        id: typeof raw.id === 'string' ? raw.id : '',
        title: typeof raw.title === 'string' ? raw.title : '',
        draft: raw.draft === true,
        status: typeof raw.status === 'string' ? raw.status : '',
        unknownFields: unknown,
        raw,
      };
    });
  }

  /** Identity of a record when the file was loaded (null for records added since). */
  loadedIdentityOf(index: number): { id: string; draft: boolean } | null {
    const node = this.node(index);
    return node ? (this.loadedIdentity.get(node) ?? null) : null;
  }

  ids(): string[] {
    return this.snapshots().map((s) => s.id);
  }

  uniqueId(base: string): string {
    const ids = new Set(this.ids());
    const clean = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
    if (!ids.has(clean)) return clean;
    let n = 2;
    while (ids.has(`${clean}-${n}`)) n += 1;
    return `${clean}-${n}`;
  }

  // --- field edits -------------------------------------------------------

  /** Sets a scalar field, preserving the existing scalar style where possible. */
  setScalar(path: (string | number)[], value: ScalarValue | undefined): void {
    if (value === undefined) {
      this.doc.deleteIn(['projects', ...path]);
      return;
    }
    // Multi-line text is written as a "|" block; a single trailing newline keeps the
    // block clipped exactly like the authored examples.
    if (typeof value === 'string' && value.includes('\n') && !value.endsWith('\n')) value = `${value}\n`;
    const existing = this.doc.getIn(['projects', ...path], true);
    if (isScalar(existing)) {
      const scalar = existing as Scalar;
      const wasMultiline = typeof scalar.value === 'string' && scalar.value.includes('\n');
      scalar.value = value;
      if (typeof value === 'string' && value.includes('\n')) {
        scalar.type = Scalar.BLOCK_LITERAL;
      } else if (wasMultiline || (typeof value === 'string' && scalar.type === Scalar.BLOCK_LITERAL && !value.includes('\n'))) {
        scalar.type = Scalar.PLAIN;
      }
      return;
    }
    const node = this.doc.createNode(value) as Scalar;
    if (typeof value === 'string' && value.includes('\n')) node.type = Scalar.BLOCK_LITERAL;
    this.doc.setIn(['projects', ...path], node);
  }

  /** Sets a list of strings (tags), keeping the flow style of an existing list. */
  setStringList(path: (string | number)[], values: string[]): void {
    const existing = this.doc.getIn(['projects', ...path], true);
    const node = this.doc.createNode(values) as YAMLSeq;
    node.flow = isSeq(existing) ? (existing as YAMLSeq).flow : true;
    if (isNode(existing)) {
      node.comment = existing.comment;
      node.commentBefore = existing.commentBefore;
      node.spaceBefore = existing.spaceBefore;
    }
    this.doc.setIn(['projects', ...path], node);
  }

  /** Sets or removes a mapping field (thumbnail). */
  setMapping(path: (string | number)[], value: Record<string, unknown> | undefined): void {
    if (value === undefined) {
      this.doc.deleteIn(['projects', ...path]);
      return;
    }
    const existing = this.doc.getIn(['projects', ...path], true);
    if (isMap(existing)) {
      const map = existing as YAMLMap;
      for (const [key, v] of Object.entries(value)) {
        if (v === undefined) map.delete(key);
        else this.setScalar([...path, key], v as ScalarValue);
      }
      for (const pair of [...map.items]) {
        const key = String((pair as Pair).key);
        if (!(key in value)) map.delete(key);
      }
      return;
    }
    this.doc.setIn(['projects', ...path], this.doc.createNode(value));
  }

  /** Appends an item to a list field (screenshots, links), creating the list if needed. */
  addListItem(index: number, field: 'screenshots' | 'links', value: Record<string, unknown>): void {
    const node = this.node(index);
    if (!node) return;
    const existing: unknown = node.get(field, true);
    let seq: YAMLSeq;
    if (isSeq(existing)) {
      seq = existing as YAMLSeq;
    } else {
      seq = new YAMLSeq();
      node.set(field, seq);
    }
    seq.add(this.doc.createNode(value));
  }

  removeListItem(index: number, field: 'screenshots' | 'links', itemIndex: number): void {
    const node = this.node(index);
    const seq = node?.get(field, true);
    if (!isSeq(seq)) return;
    (seq as YAMLSeq).items.splice(itemIndex, 1);
    if ((seq as YAMLSeq).items.length === 0) node!.delete(field);
  }

  moveListItem(index: number, field: 'screenshots' | 'links', itemIndex: number, direction: -1 | 1): void {
    const node = this.node(index);
    const seq = node?.get(field, true);
    if (!isSeq(seq)) return;
    const items = (seq as YAMLSeq).items;
    const target = itemIndex + direction;
    if (target < 0 || target >= items.length) return;
    [items[itemIndex], items[target]] = [items[target] as Node, items[itemIndex] as Node];
  }

  /** Marks exactly one link primary (or none), removing "primary" from the others. */
  setPrimaryLink(index: number, linkIndex: number | null): void {
    const node = this.node(index);
    const seq = node?.get('links', true);
    if (!isSeq(seq)) return;
    (seq as YAMLSeq).items.forEach((item, i) => {
      if (!isMap(item)) return;
      if (i === linkIndex) (item as YAMLMap).set('primary', this.doc.createNode(true));
      else if ((item as YAMLMap).has('primary')) (item as YAMLMap).delete('primary');
    });
  }

  // --- project operations ------------------------------------------------

  addProject(record: Record<string, unknown>): number {
    const seq = this.seq();
    const node = this.doc.createNode(record) as YAMLMap;
    const tags = node.get('tags', true);
    if (isSeq(tags)) (tags as YAMLSeq).flow = true;
    seq.add(node);
    node.spaceBefore = true;
    return seq.items.length - 1;
  }

  duplicateProject(index: number): number | null {
    const seq = this.seq();
    const original = this.node(index);
    if (!original) return null;
    const copy = original.clone() as YAMLMap;
    const originalId = original.get('id');
    copy.set('id', this.doc.createNode(this.uniqueId(`${typeof originalId === 'string' ? originalId : 'project'}-copy`)));
    copy.set('draft', this.doc.createNode(true));
    copy.spaceBefore = true;
    seq.items.splice(index + 1, 0, copy);
    return index + 1;
  }

  removeProject(index: number): void {
    this.seq().items.splice(index, 1);
  }

  moveProject(index: number, direction: -1 | 1): number {
    const items = this.seq().items;
    const target = index + direction;
    if (target < 0 || target >= items.length) return index;
    [items[index], items[target]] = [items[target] as Node, items[index] as Node];
    return target;
  }

  /** Reads a field from a record as plain data. */
  getField(index: number, field: ProjectField): unknown {
    const node = this.node(index);
    if (!node) return undefined;
    const value: unknown = node.get(field, true);
    return isNode(value) ? value.toJS(this.doc) : value;
  }
}
