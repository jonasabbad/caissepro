import { describe, expect, it } from 'vitest';
import { assertLocalTestDatabaseUrl, testDatabaseUrlProblem } from './db-guard.js';

describe('test database guard', () => {
  it('accepts a local test database on 127.0.0.1 or localhost', () => {
    for (const url of [
      'mysql://caissepro:pw@127.0.0.1:3307/caissepro_test',
      'mysql://caissepro:pw@localhost:3306/caissepro_test',
      'mysql://u:pw@LOCALHOST/test_db?connection_limit=5',
      'mysql://u@127.0.0.1/MyTestDb',
    ]) {
      expect(testDatabaseUrlProblem(url), url).toBeNull();
      expect(assertLocalTestDatabaseUrl(url)).toBe(url);
    }
  });

  it('rejects remote hosts even when the database name contains "test"', () => {
    for (const url of [
      'mysql://u:pw@db.example.com:3306/caissepro_test',
      'mysql://u:pw@srv123.hstgr.io/u251095411_test',
      'mysql://u:pw@192.168.1.20:3306/caissepro_test',
      'mysql://u:pw@10.0.0.5/caissepro_test',
      'mysql://u:pw@0.0.0.0/caissepro_test',
      'mysql://u:pw@[::1]:3306/caissepro_test',
      'mysql://u:pw@127.0.0.2/caissepro_test',
      // Look-alikes of the allowed hosts.
      'mysql://u:pw@localhost.example.com/caissepro_test',
      'mysql://u:pw@127.0.0.1.nip.io/caissepro_test',
      'mysql://localhost:pw@db.example.com/caissepro_test',
      'mysql://u:pw@db.example.com/caissepro_test?x=@127.0.0.1',
    ]) {
      expect(testDatabaseUrlProblem(url), url).toMatch(/127\.0\.0\.1 or localhost/);
      expect(() => assertLocalTestDatabaseUrl(url), url).toThrow();
    }
  });

  it('rejects parameters that would send the connection elsewhere', () => {
    for (const url of [
      'mysql://u:pw@127.0.0.1/caissepro_test?host=db.example.com',
      'mysql://u:pw@localhost/caissepro_test?socket=/tmp/remote.sock',
    ]) {
      expect(() => assertLocalTestDatabaseUrl(url), url).toThrow(/must not set/);
    }
  });

  it('keeps rejecting non-test names and other databases, as before', () => {
    for (const url of [
      'mysql://u:pw@127.0.0.1:3307/caissepro_dev',
      'mysql://u:pw@localhost/caissepro',
      'mysql://u:pw@127.0.0.1/',
      'postgres://u:pw@127.0.0.1/caissepro_test',
      'file:./test.db',
      '',
      undefined,
    ]) {
      expect(() => assertLocalTestDatabaseUrl(url as string | undefined), String(url)).toThrow();
    }
  });
});
