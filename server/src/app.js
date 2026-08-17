/**
 * Builds the Express application: all the middleware and routes.
 *
 * This file deliberately does NOT start the server — it just describes what
 * the server *does*. Starting it is index.js's job. Keeping those separate
 * means we can later load this app in a test without opening a real port.
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { config, isProduction } from './config.js';
import healthRouter from './routes/health.js';

export function createApp() {
  const app = express();

  // Railway sits in front of us as a proxy. This tells Express to trust the
  // headers Railway adds, so things like the visitor's real IP and whether
  // the request came over HTTPS are reported correctly.
  app.set('trust proxy', 1);

  // Sets a batch of security-related HTTP headers. Sensible defaults; you
  // don't need to configure anything.
  app.use(helmet());

  // Browsers block a web page from calling an API on a different domain
  // unless that API explicitly allows it. This is that permission list.
  // With no origins configured we allow none — safe default while the API
  // has no frontend attached yet. Tools like curl and Postman are unaffected.
  app.use(
    cors({
      origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
      credentials: true,
    })
  );

  // Understand JSON request bodies, e.g. when the frontend posts a new post.
  // The 1mb cap stops someone sending a huge payload to exhaust memory;
  // actual images will go to Supabase Storage, not through here.
  app.use(express.json({ limit: '1mb' }));

  // Log every request to the console. 'combined' is the verbose Apache-style
  // format that's useful in Railway's log viewer; 'dev' is short and colourful
  // for local work.
  app.use(morgan(isProduction ? 'combined' : 'dev'));

  // --- Routes ---------------------------------------------------------
  // Root: a friendly "yes, this is Slate's API" response, so hitting the
  // Railway URL in a browser shows something meaningful.
  app.get('/', (req, res) => {
    res.json({
      name: 'Slate API',
      version: '0.1.0',
      docs: 'Phase 1: minimal server. See /health for status.',
    });
  });

  app.use('/health', healthRouter);

  // --- Error handling -------------------------------------------------
  // Anything that didn't match a route above lands here: a 404.
  app.use((req, res) => {
    res.status(404).json({
      error: 'not_found',
      message: `No route matches ${req.method} ${req.originalUrl}`,
    });
  });

  // The final safety net. If any route throws an unexpected error, Express
  // hands it to this function (it's identified by having four arguments).
  // Without it, Express would return a bare HTML error page that can leak
  // internal file paths.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(err.status || 500).json({
      error: 'internal_error',
      // In production we deliberately hide the real message from the caller —
      // it's already in the logs, and error text often reveals internals.
      message: isProduction ? 'Something went wrong.' : err.message,
    });
  });

  return app;
}
