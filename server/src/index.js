/**
 * Entry point: starts the server.
 *
 * `npm start` runs this file. It builds the app (see app.js), opens the port,
 * and sets up clean shutdown behaviour.
 */
import { createApp } from './app.js';
import { config } from './config.js';
import { closePool } from './db/index.js';

const app = createApp();

// '0.0.0.0' means "accept connections on every network interface".
// This matters on Railway: the default of localhost would only accept
// connections from inside the container, so Railway's router could never
// reach us and every request would time out.
const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(
    `Slate API listening on port ${config.port} (${config.nodeEnv})`
  );
});

/**
 * Graceful shutdown.
 *
 * When you deploy a new version, Railway asks the old one to stop by sending
 * a SIGTERM signal. Without this handler the process would be killed mid-flight
 * and any request being served at that instant would fail for the user.
 * Instead we stop accepting new connections, let in-flight requests finish,
 * then exit. The 10-second timer is a backstop so a stuck request can't hold
 * the deploy open forever.
 */
function shutdown(signal) {
  console.log(`${signal} received — shutting down gracefully.`);

  server.close(async () => {
    // Only close the database once in-flight requests have finished — they
    // may still be mid-query, and pulling the pool out from under them would
    // turn a clean shutdown into failed requests.
    try {
      await closePool();
    } catch (err) {
      console.error('Error closing database pool:', err.message);
    }
    console.log('All connections closed. Goodbye.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Could not close connections in time — forcing exit.');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT')); // Ctrl+C on your laptop

/**
 * Last-resort safety nets. If a bug produces an error nobody caught, we log
 * it loudly and exit so Railway restarts us into a known-good state. A server
 * limping along in a broken state is worse than one that restarts.
 */
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
  shutdown('unhandledRejection');
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  shutdown('uncaughtException');
});
