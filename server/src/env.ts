// Imported first by index.ts: settings come from the host's environment variables (e.g. Hostinger), or from a
// server/.env file when there is one (local development).
// Hosts such as Hostinger write the variables to a .env file at the app root (the folder above server/).
for (const file of ['.env', '../.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    /* no such file: the environment variables are used as they are */
  }
}

// A value pasted with quotes or spaces around it ("file:/…") would not be recognised as a SQLite path.
if (process.env.DATABASE_URL) process.env.DATABASE_URL = process.env.DATABASE_URL.trim().replace(/^(['"])(.*)\1$/, '$2').trim();

// In production, refuse to start with the development fallback secrets (anyone could forge sessions).
if (process.env.NODE_ENV === 'production') {
  for (const k of ['JWT_SECRET', 'JWT_REFRESH_SECRET']) {
    if ((process.env[k] ?? '').length < 32) {
      console.error(`${k} must be set to a random value of at least 32 characters`);
      process.exit(1);
    }
  }
}
