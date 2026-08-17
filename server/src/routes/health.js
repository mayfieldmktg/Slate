/**
 * Health check endpoint.
 *
 * This is the endpoint Railway pings to decide whether a newly deployed
 * version actually came up successfully. If it doesn't answer with a 200,
 * Railway keeps the previous version running instead of swapping in a broken
 * one. It's also the fastest way for you to confirm "is my server alive?".
 *
 * In later phases we'll extend this to also check that Supabase is reachable.
 */
import { Router } from 'express';

import { config } from '../config.js';

const router = Router();

// The moment this process started, used to report how long it's been up.
const startedAt = new Date();

router.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    environment: config.nodeEnv,
    // How many seconds this server has been running. Resets on every deploy
    // or restart, which makes it a handy way to confirm a deploy landed.
    uptimeSeconds: Math.floor(process.uptime()),
    startedAt: startedAt.toISOString(),
    timestamp: new Date().toISOString(),
  });
});

export default router;
