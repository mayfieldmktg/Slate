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

function loadConfig() {
  return {
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

  // Full Postgres connection string from Supabase.
  // Settings -> Database -> Connection string -> "Session pooler".
  databaseUrl: required('DATABASE_URL'),

  // Supabase requires an encrypted connection. Node verifies the server's
  // certificate against its built-in list of trusted authorities, which is
  // what you want — it proves you're really talking to Supabase and not
  // something intercepting the connection.
  //
  // Some Supabase connection routes present a certificate Node's default
  // list doesn't cover, which shows up as "self-signed certificate in
  // certificate chain". Setting DATABASE_SSL_NO_VERIFY=true works around it
  // by skipping that check. Only reach for it if you hit that exact error:
  // it keeps the traffic encrypted but stops verifying who is on the other
  // end, so it is strictly a fallback and not the setting to start with.
  databaseSsl: {
    rejectUnauthorized: optional('DATABASE_SSL_NO_VERIFY', 'false') !== 'true',
  },
  };
}

/**
 * A missing setting is a configuration problem, not a code problem, so we
 * report it as one: a short readable message and a clean exit, rather than a
 * stack trace. When this shows up in Railway's log at 7am it should be
 * immediately obvious what to go and fix.
 */
let loaded;
try {
  loaded = loadConfig();
} catch (err) {
  console.error('\nSlate could not start — configuration problem:\n');
  console.error(`  ${err.message}\n`);
  console.error('See server/.env.example for the full list of settings.\n');
  process.exit(1);
}

export const config = loaded;

export const isProduction = config.nodeEnv === 'production';

// Re-exported so later phases (Supabase, Meta OAuth) can demand their own
// required variables without re-implementing this check.
export { required, optional };
