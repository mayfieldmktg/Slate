/**
 * Health check endpoints.
 *
 * There are two, and the difference matters:
 *
 *   GET /health        "Is the server process alive?"
 *                      Always returns 200 if we can answer at all. This is
 *                      the one Railway pings.
 *
 *   GET /health/ready  "Is the server able to do useful work right now?"
 *                      Returns 503 if the database is unreachable.
 *
 * Why not point Railway at the stricter one? Because Railway restarts or
 * rolls back a deploy that fails its healthcheck. If a brief Supabase blip
 * made /health fail, Railway would tear down a perfectly good server and
 * redeploy it into the same outage — turning a two-minute database hiccup
 * into a much longer one. Liveness and readiness answer different questions
 * and conflating them causes exactly that kind of restart loop.
 *
 * A genuinely broken configuration is still caught: config.js refuses to
 * start without DATABASE_URL, so the process never comes up and the
 * healthcheck fails for real.
 */
import { Router } from 'express';

import { config } from '../config.js';
import { ping } from '../db/index.js';

const router = Router();

const startedAt = new Date();

/**
 * Checks the database and never throws — it reports the failure instead,
 * so a database problem shows up as readable JSON rather than a 500.
 */
async function checkDatabase() {
  try {
    const latencyMs = await ping();
    return { connected: true, latencyMs };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}

// Liveness — what Railway pings.
router.get('/', async (req, res) => {
  const database = await checkDatabase();

  res.status(200).json({
    status: 'ok',
    environment: config.nodeEnv,
    uptimeSeconds: Math.floor(process.uptime()),
    startedAt: startedAt.toISOString(),
    timestamp: new Date().toISOString(),
    database,
  });
});

// Readiness — use this one when you want a hard yes/no on the database.
router.get('/ready', async (req, res) => {
  const database = await checkDatabase();

  res.status(database.connected ? 200 : 503).json({
    status: database.connected ? 'ready' : 'not_ready',
    database,
    timestamp: new Date().toISOString(),
  });
});

export default router;
