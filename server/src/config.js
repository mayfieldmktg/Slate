/**
 * Central place where the server reads its settings.
 *
 * Everything the server needs to know that changes between your laptop and
 * Railway (ports, URLs, secret keys) lives in "environment variables" rather
 * than in the code. Locally those come from a .env file; on Railway you set
 * them in the dashboard. Nothing secret is ever committed to git.
 */
import dotenv from 'dotenv';

// Load .env into process.env when running locally.
// On Railway there is no .env file, and that's fine — Railway injects the
// variables directly, so this line simply does nothing there.
dotenv.config();

/**
 * Reads a variable that the server cannot run without.
 * If it's missing we crash immediately with a clear message, rather than
 * failing mysteriously later on when something tries to use it.
 */
function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Add it to server/.env locally, or to the Variables tab in Railway.`
    );
  }
  return value;
}

/**
 * Reads an optional variable, falling back to a default.
 */
function optional(name, fallback) {
  return process.env[name] || fallback;
}

export const config = {
  // Railway assigns the port for us at runtime and passes it in as PORT.
  // We must listen on exactly that port or Railway can't route traffic to us.
  port: Number(optional('PORT', 3000)),

  // 'development' on your laptop, 'production' on Railway.
  nodeEnv: optional('NODE_ENV', 'development'),

  // Which websites are allowed to call this API from a browser.
  // Comma-separated, e.g. "http://localhost:5173,https://app.slate.com"
  // Until the frontend is connected (phase 6) this can stay empty.
  corsOrigins: optional('CORS_ORIGINS', '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
};

export const isProduction = config.nodeEnv === 'production';

// Re-exported so later phases (Supabase, Meta OAuth) can demand their own
// required variables without re-implementing this check.
export { required, optional };
