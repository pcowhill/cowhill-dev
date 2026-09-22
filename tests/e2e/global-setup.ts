import { buildFixtureSite } from '../helpers/build-site.ts';

export default function globalSetup(): void {
  buildFixtureSite('root', { force: true });
  buildFixtureSite('repo', { force: true });
}
