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
| 1 | Minimal deployed server | Done — live on Railway |
| 2 | Database schema (Supabase) | **Current** |
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
| `server/src/routes/health.js` | The `/health` endpoints |
| `server/src/db/index.js` | Database connection pool and query helpers |
| `server/src/db/migrate.js` | Applies migration files (`npm run migrate`) |
| `server/migrations/*.sql` | The database schema, as numbered steps |
| `server/.env.example` | Template listing every setting (safe to commit) |
| `server/.env` | Your real settings — **never committed** |
| `server/railway.json` | Tells Railway how to build and run the server |

### Endpoints so far

| Method | Path | Response |
| ------ | ---- | -------- |
| `GET` | `/` | API name and version |
| `GET` | `/health` | Status, environment, uptime, database connectivity |
| `GET` | `/health/ready` | `200` if the database is reachable, `503` if not |
| any | anything else | `404` with a JSON error body |

There are two health endpoints because they answer different questions.
`/health` asks "is the server alive?" and always returns `200` if it can reply
at all — this is the one Railway pings. `/health/ready` asks "can it do useful
work right now?" and returns `503` when the database is unreachable.

Keeping them separate matters: Railway rolls back a deploy that fails its
healthcheck, so if a brief Supabase outage made `/health` fail, Railway would
tear down a perfectly healthy server and redeploy it into the same outage.
Tested by stopping the database mid-request — `/health` stayed `200`,
`/health/ready` returned `503`, the process stayed up, and it recovered on its
own when the database came back with no restart needed.

---

## Setting up the database (phase 2)

### 1. Create the Supabase project

At [supabase.com](https://supabase.com), create a project and save the
database password somewhere safe — it's shown only once.

### 2. Get the connection string

Dashboard → **Settings** → **Database** → **Connection string** → the
**Session pooler** tab.

Use the session pooler, **not** "Direct connection". The direct connection is
IPv6-only unless you pay for Supabase's IPv4 add-on, and Railway will fail to
reach it with a confusing `ENETUNREACH` error. The session pooler works over
IPv4 and otherwise behaves identically.

Replace `[YOUR-PASSWORD]` with your real password. If it contains symbols like
`@ : / #`, they must be percent-encoded (`@` → `%40`, `#` → `%23`) or the URL
will be misread.

### 3. Run the migration

Locally first, so you see any error clearly:

```bash
cd server
# add DATABASE_URL=... to server/.env
npm install
npm run migrate
```

You should see:

```
Applying 001_initial_schema.sql ... done
Migrations complete.
```

Running it again is safe — it will say `Database already up to date`.

### 4. Add the variable to Railway

Railway → your service → **Variables** → add `DATABASE_URL` with the same
value. Deploy. Then check `https://<your-domain>/health` — `database` should
report `"connected": true`.

> If connecting fails with `self-signed certificate in certificate chain`,
> set `DATABASE_SSL_NO_VERIFY=true` as well. Try it only for that specific
> error: it keeps traffic encrypted but stops verifying who's on the other
> end, so it's a fallback rather than a starting point.

### What the schema looks like

See [`docs/schema.md`](docs/schema.md) for a diagram and a plain-language
tour of every table. The SQL itself is in `server/migrations/` and is
commented throughout.

### Changing the schema later

Never edit a migration that has already run — the runner stores a fingerprint
of each file and refuses to continue if one changes, because the database and
the file would no longer agree. Instead add a new numbered file
(`002_...sql`) and run `npm run migrate` again.

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
