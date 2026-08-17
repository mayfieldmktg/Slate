# Slate

Social media management tool — content calendar, client approval flow,
analytics, and scheduled publishing to Instagram and Facebook.

## Repository layout

```
Slate/
  server/     Backend API (Node.js + Express)  ← you are here in phase 1
  web/        React frontend (added later)
```

The React prototype currently lives outside this repo. We can move it into
`web/` in phase 6 when we connect it to this API, or leave it where it is and
deploy it separately — either works.

## Build phases

| Phase | What it does | Status |
| ----- | ------------ | ------ |
| 1 | Minimal deployed server | **Current** |
| 2 | Database schema (Supabase) | Not started |
| 3 | Meta OAuth callback endpoint | Not started |
| 4 | Manual test publish | Not started |
| 5 | Scheduling engine | Not started |
| 6 | Connect the existing frontend | Not started |
| 7 | Token refresh handling | Not started |

---

## Running the server locally

You need [Node.js](https://nodejs.org) 20 or newer (`node --version` to check).

```bash
cd server
npm install            # install dependencies (once, and after any dependency change)
cp .env.example .env   # create your local settings file
npm run dev            # start the server, auto-restarting when you edit a file
```

Then open <http://localhost:3000/health> in a browser. You should see:

```json
{
  "status": "ok",
  "environment": "development",
  "uptimeSeconds": 12,
  "startedAt": "2026-08-17T20:48:34.183Z",
  "timestamp": "2026-08-17T20:48:46.101Z"
}
```

`npm run dev` restarts on save, which is what you want while working.
`npm start` runs it once without watching — that's the production mode.

Press `Ctrl+C` to stop it.

### What each file does

| File | Purpose |
| ---- | ------- |
| `server/src/index.js` | Starts the server and handles clean shutdown |
| `server/src/app.js` | Defines middleware and wires up routes |
| `server/src/config.js` | Reads settings from environment variables |
| `server/src/routes/health.js` | The `/health` endpoint |
| `server/.env.example` | Template listing every setting (safe to commit) |
| `server/.env` | Your real settings — **never committed** |
| `server/railway.json` | Tells Railway how to build and run the server |

### Endpoints so far

| Method | Path | Response |
| ------ | ---- | -------- |
| `GET` | `/` | API name and version |
| `GET` | `/health` | Status, environment, uptime |
| any | anything else | `404` with a JSON error body |

---

## Deploying to Railway

1. Go to [railway.app](https://railway.app) → **New Project** →
   **Deploy from GitHub repo** → pick `mayfieldmktg/Slate`.
2. Open the service → **Settings** → set **Root Directory** to `server`.
   This is the important one. Without it Railway looks at the repo root,
   finds no `package.json`, and the build fails.
3. **Settings** → **Networking** → **Generate Domain**. This gives you a
   public URL like `slate-production-xxxx.up.railway.app`.
4. **Variables** tab → add:

   | Variable | Value |
   | -------- | ----- |
   | `NODE_ENV` | `production` |

   Do **not** set `PORT`. Railway assigns the port itself and passes it in;
   setting it manually is the most common way to end up with a deploy that
   builds fine but never responds.

5. Deploy. When it finishes, visit `https://<your-domain>/health` — you should
   see the same JSON as above, but with `"environment": "production"`.

Railway reads `server/railway.json` for the rest: it runs `node src/index.js`
and won't switch traffic to a new version until `/health` returns a `200`, so
a broken deploy leaves the previous version serving.

### Why the start command is `node src/index.js` and not `npm start`

Both work, but they behave differently on shutdown. When Railway deploys a new
version it asks the old one to stop with a `SIGTERM` signal. If `npm` is the
process receiving that signal, it exits without passing the signal on to the
Node process it started — so our graceful-shutdown code never runs and any
request being served at that moment is cut off. Running Node directly means
Node receives the signal itself, finishes in-flight requests, and then exits.

(Verified rather than assumed: with `npm start`, the Node process survived its
parent and had to be killed manually.)

---

## Security notes

- `server/.env` is git-ignored and must stay that way — from phase 2 onward it
  holds real credentials (Supabase service key, Meta app secret).
  `.env.example` is the committed template and holds no real values.
- If a secret is ever committed by accident, rotate it at the source
  (Supabase / Meta dashboard). Deleting the file afterwards is not enough,
  because it stays in git history.
- `CORS_ORIGINS` is empty by default, meaning no website is allowed to call
  this API from a browser. We'll add the frontend's URL in phase 6.
