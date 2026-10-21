// Imported first by index.ts: settings come from the host's environment variables (e.g. Hostinger), or from a
// server/.env file when there is one (local development).
try {
  process.loadEnvFile('.env');
} catch {
  /* no .env file: the environment variables are used as they are */
}

// In production, refuse to start with the development fallback secrets (anyone could forge sessions).
if (process.env.NODE_ENV === 'production') {
  for (const k of ['JWT_SECRET', 'JWT_REFRESH_SECRET']) {
    if ((process.env[k] ?? '').length < 32) {
      console.error(`${k} must be set to a random value of at least 32 characters`);
      process.exit(1);
    }
  }
}
