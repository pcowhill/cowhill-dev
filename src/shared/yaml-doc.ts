/**
 * Comment-aware YAML parsing shared by the build, the validator and the editor.
 * The `yaml` Document API keeps comments, ordering and scalar styles so that
 * edits made by the editor can be written back without rewriting the file.
 */
import { parseDocument, Document, isMap, isSeq, YAMLMap, YAMLSeq, type ParsedNode } from 'yaml';
import type { ValidationIssue } from './validate.ts';

export interface ParsedYaml {
  document: Document.Parsed | null;
  data: unknown;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export const YAML_STRINGIFY_OPTIONS = {
  // Never fold long lines: keeps summaries and links on one line as authored.
  lineWidth: 0,
  indent: 2,
  indentSeq: true,
  flowCollectionPadding: false,
} as const;

/** Parses YAML text, reporting syntax errors and duplicate keys with line numbers. */
export function parseYamlText(text: string): ParsedYaml {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const document = parseDocument(text, { uniqueKeys: true, prettyErrors: true, strict: true });
  for (const err of document.errors) {
    const line = err.linePos?.[0]?.line;
    errors.push({ path: line ? `line ${line}` : '', message: cleanMessage(err.message), level: 'error' });
  }
  for (const warn of document.warnings) {
    const line = warn.linePos?.[0]?.line;
    warnings.push({ path: line ? `line ${line}` : '', message: cleanMessage(warn.message), level: 'warning' });
  }
  if (errors.length > 0) {
    return { document: null, data: undefined, errors, warnings };
  }
  let data: unknown;
  try {
    data = document.toJS({ maxAliasCount: 100 });
  } catch (err) {
    errors.push({ path: '', message: `could not convert YAML to data: ${(err as Error).message}`, level: 'error' });
    return { document: null, data: undefined, errors, warnings };
  }
  return { document, data, errors, warnings };
}

function cleanMessage(message: string): string {
  // yaml's pretty errors append a code frame; keep the first sentence readable.
  return message.split('\n')[0]?.trim() ?? message;
}

/** Returns the `projects` sequence node of a parsed document, creating it when absent. */
export function getProjectsSeq(document: Document): YAMLSeq {
  const contents = document.contents;
  if (!isMap(contents)) {
    throw new Error('the YAML document root must be a mapping');
  }
  const existing: unknown = contents.get('projects', true);
  if (isSeq(existing)) return existing as YAMLSeq;
  const seq = new YAMLSeq();
  contents.set('projects', seq);
  return seq;
}

export function isMapNode(node: unknown): node is YAMLMap {
  return isMap(node as ParsedNode);
}
