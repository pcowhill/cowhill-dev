import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

/**
 * Guards the shape of .github/workflows/site.yml: production deployment and
 * the live Pages origin/base comparison must share one condition, pull
 * requests must run the substantive checks without that comparison, and no
 * step may soften the comparison.
 */
const PRODUCTION_CONDITION = "github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch')";

interface Step {
  name?: string;
  id?: string;
  if?: string;
  run?: string;
  uses?: string;
  'continue-on-error'?: unknown;
}
interface Job {
  if?: string;
  needs?: string | string[];
  steps?: Step[];
  permissions?: Record<string, string>;
}
interface Workflow {
  on: Record<string, unknown>;
  jobs: Record<string, Job>;
}

const workflow = parse(fs.readFileSync(path.join(process.cwd(), '.github', 'workflows', 'site.yml'), 'utf8')) as Workflow;
const build = workflow.jobs.build!;
const deploy = workflow.jobs.deploy!;
const steps = build.steps ?? [];
const step = (predicate: (s: Step) => boolean): Step => {
  const found = steps.find(predicate);
  if (!found) throw new Error('step not found');
  return found;
};
const pagesLookup = step((s) => (s.uses ?? '').startsWith('actions/configure-pages@'));
const pagesCheck = step((s) => (s.run ?? '').includes('check:pages-config'));
const substantive = ['npm run validate', 'npm run editor:check', 'npm run typecheck', 'npm test', 'npm run build', 'npm run inspect-dist', 'npm run test:e2e'];

describe('site workflow', () => {
  it('runs on pull requests, pushes to main and manual dispatch', () => {
    expect(Object.keys(workflow.on)).toEqual(expect.arrayContaining(['push', 'pull_request', 'workflow_dispatch']));
    expect((workflow.on.push as { branches: string[] }).branches).toEqual(['main']);
  });
  it('deploys only from main on push or manual dispatch', () => {
    expect(deploy.if).toBe(PRODUCTION_CONDITION);
    expect(deploy.needs).toBe('build');
    expect(build.if).toBeUndefined();
  });
  it('compares the live Pages configuration exactly on production-deploy-capable runs and never softens it', () => {
    expect(pagesLookup.if).toBe(PRODUCTION_CONDITION);
    expect(pagesCheck.if).toBe(PRODUCTION_CONDITION);
    expect(pagesCheck.run).toContain(`--origin "\${{ steps.${pagesLookup.id}.outputs.origin }}"`);
    expect(pagesCheck.run).toContain(`--base-path "\${{ steps.${pagesLookup.id}.outputs.base_path }}"`);
    expect(steps.indexOf(pagesCheck)).toBeGreaterThan(steps.indexOf(pagesLookup));
    for (const s of steps) expect(s['continue-on-error'], s.name).toBeUndefined();
    expect(pagesCheck.run).not.toMatch(/\|\|\s*true|skip|bypass/i);
  });
  it('keeps every substantive check unconditional so pull requests run them', () => {
    for (const command of substantive) {
      const s = step((candidate) => (candidate.run ?? '').split('\n').some((line) => line.trim() === command));
      expect(s.if, command).toBeUndefined();
    }
    const upload = step((s) => (s.uses ?? '').startsWith('actions/upload-pages-artifact@'));
    expect(steps.indexOf(upload)).toBeGreaterThan(steps.indexOf(step((s) => s.run === 'npm run inspect-dist')));
  });
  it('gives the build job no deployment permissions', () => {
    expect(build.permissions?.pages).toBe('read');
    expect(build.permissions?.['id-token']).toBeUndefined();
    expect(deploy.permissions).toEqual({ pages: 'write', 'id-token': 'write' });
  });
});
