# Deploying to Railway

Single-service deploy: the NestJS API serves the built React app from `/` and
the API routes (`/calls`, `/setup`, `/briefs`) from the same origin. No CORS,
one URL, one service.

## Prerequisites

- Railway account
- A Supabase project with the schema from the plan file applied (tables
  `briefs` and `interviews`)
- API keys for:
  - ElevenLabs (`ELEVENLABS_API_KEY`)
  - Google Gemini (`GEMINI_API_KEY`)
  - Supabase (`SUPABASE_URL` + `SUPABASE_ANON_KEY`)

## Step 1 — Connect the repo

1. `railway login` (if using CLI) or open <https://railway.app/new>.
2. Choose **Deploy from GitHub repo** and pick this repo.
3. Railway detects `railway.json` at the root and uses it automatically. The
   build command is `pnpm install --frozen-lockfile && pnpm build` and the start
   command is `pnpm start`.

If you prefer the CLI:

```bash
railway init
railway up
```

## Step 2 — Set environment variables

In the Railway service → **Variables** tab, add:

| Variable | Value |
| --- | --- |
| `ELEVENLABS_API_KEY` | `xi-...` |
| `ELEVENLABS_VOICE_ID` | `cjVigY5qzO86Huf0OWal` (or your chosen voice) |
| `GEMINI_API_KEY` | `AIza...` |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | `eyJ...` |

`PORT` is set automatically by Railway — don't override it. The app listens on
`0.0.0.0:$PORT`.

## Step 3 — Generate a public domain

Railway service → **Settings** → **Networking** → **Generate Domain**. Copy
the resulting `*.up.railway.app` URL — that's your app.

## Step 4 — Verify

Once the deploy is green:

```bash
# root loads the React app
curl -I https://<your-domain>.up.railway.app/

# API health
curl -X POST https://<your-domain>.up.railway.app/setup/start
```

Then open the domain in a browser and walk through the flow:

1. Land on `/` → describe a research brief in the chat.
2. Gemini returns a brief → click **Create interview**.
3. Redirects to `/briefs/:id` → copy the interview URL.
4. Open the interview URL in an incognito window → click **Begin interview**.
5. End the call → thank-you card.
6. Check Supabase: the new row in `interviews` links to the brief via
   `brief_id`.

## How the build works

Railway runs, in order:

1. `pnpm install --frozen-lockfile` — installs workspace deps
2. `pnpm build` — builds the web app then the API
   - `apps/web/dist/` — compiled React bundle
   - `apps/api/dist/` — compiled NestJS
3. `pnpm start` — runs `node apps/api/dist/main` via the workspace filter

At runtime, the NestJS app looks for `apps/web/dist/index.html` (relative to
the compiled `main.js`) and serves it plus `assets/*` as static files.
API controllers at `/calls/*`, `/setup/*`, and `/briefs/*` are excluded from
static serving so they keep their controller semantics.

## Splitting into two services (later)

When you're ready to split the frontend onto its own Railway service or a CDN
like Vercel:

1. Remove `ServeStaticModule` import from `apps/api/src/app.module.ts` (or
   leave it — it's a no-op if `apps/web/dist` isn't present).
2. Add `VITE_API_URL` support in `apps/web/src/lib/api.ts` — prepend that base
   to every fetch path if it's set.
3. Set `app.enableCors({ origin: 'https://<your-web-domain>' })` in
   `apps/api/src/main.ts`.
4. Create a new Railway service with root directory `apps/web` and build
   command `pnpm install --frozen-lockfile && pnpm --filter web build`, then
   serve the `dist` output with a static server (or deploy `apps/web/dist` to
   Vercel/Netlify).

## Troubleshooting

**Deploy shows "building forever"** — check the build logs. Pnpm needs the
workspace root; `railway.json` keeps the root as the service root, which is
what we want.

**404 on `/` after deploy** — the web build didn't produce `apps/web/dist/
index.html`. Confirm `pnpm build` locally produces both `apps/web/dist` and
`apps/api/dist`.

**500 on `/setup/start`** — usually a missing env var. Check the Railway
deployment logs for `Configuration key "…" does not exist`.

**WebRTC call fails** — ElevenLabs signed URLs are tied to your API key and
voice. Verify `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` are set on the
Railway service.
