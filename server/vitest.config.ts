import { defineConfig } from 'vitest/config';

// Tests run on their own MariaDB/MySQL database, emptied at every run: TEST_DATABASE_URL, from the environment or
// server/.env.test (not committed). Its name must contain "test", so a real database can never be used by mistake.
try {
  process.loadEnvFile('.env.test');
} catch {
  /* set in the environment instead */
}
const url = process.env.TEST_DATABASE_URL ?? '';
if (!/^mysql:\/\/.+\/[^/?]*test[^/?]*(\?.*)?$/i.test(url)) {
  throw new Error('Set TEST_DATABASE_URL to a MySQL/MariaDB database whose name contains "test" (e.g. mysql://user:pass@127.0.0.1:3306/caissepro_test)');
}

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    env: { DATABASE_URL: url, JWT_SECRET: 'test-secret', UPLOAD_DIR: './uploads-test' },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
