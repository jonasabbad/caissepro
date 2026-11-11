/**
 * The test suite empties its database at every run, so it may only ever point at a local test database:
 *  - a mysql:// URL (MariaDB/MySQL),
 *  - whose host is exactly 127.0.0.1 or localhost (never a remote server, whatever its database is called),
 *  - whose database name contains "test".
 * Used by vitest.config.ts (before anything starts) and by test/global-setup.ts (again, right before dropping tables).
 */
export const LOCAL_TEST_HOSTS = ['127.0.0.1', 'localhost'] as const;

/** Same rule as before this guard existed: a mysql:// URL whose database name contains "test". Kept as is. */
const TEST_NAME_URL = /^mysql:\/\/.+\/[^/?]*test[^/?]*(\?.*)?$/i;

/** Query parameters that could make the driver connect somewhere other than the URL's host. */
const REDIRECTING_PARAMS = ['host', 'socket', 'hostname', 'server'];

/** Returns why the URL is refused, or null when it is a local test database. */
export function testDatabaseUrlProblem(url: string | undefined): string | null {
  const raw = (url ?? '').trim();
  if (!TEST_NAME_URL.test(raw)) return 'TEST_DATABASE_URL must be a mysql:// URL whose database name contains "test"';
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return 'TEST_DATABASE_URL is not a valid URL';
  }
  if (u.protocol !== 'mysql:') return 'TEST_DATABASE_URL must use mysql://';
  const host = u.hostname.toLowerCase();
  if (!(LOCAL_TEST_HOSTS as readonly string[]).includes(host)) {
    return `TEST_DATABASE_URL must point at this computer (127.0.0.1 or localhost), not "${host || '(none)'}"`;
  }
  for (const p of u.searchParams.keys()) {
    if (REDIRECTING_PARAMS.includes(p.toLowerCase())) return `TEST_DATABASE_URL must not set "${p}": the host must be 127.0.0.1 or localhost`;
  }
  const name = decodeURIComponent(u.pathname.replace(/^\//, ''));
  if (!name || name.includes('/') || !/test/i.test(name)) return 'TEST_DATABASE_URL database name must contain "test"';
  return null;
}

/** Throws unless the URL is a local test database. */
export function assertLocalTestDatabaseUrl(url: string | undefined): string {
  const problem = testDatabaseUrlProblem(url);
  if (problem) throw new Error(`${problem} (e.g. mysql://user:pass@127.0.0.1:3306/caissepro_test)`);
  return url!.trim();
}
