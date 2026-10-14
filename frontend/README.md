# AegisCare — Multimodal Intelligent Fall Monitoring System

Website for the R26_IT_051 final-year research project. Built with
React + Vite + Tailwind CSS + Framer Motion.

Pages:
- `/` — public landing page (hero, about, team, contact)
- `/login` — staff login (hardcoded credentials, see below)
- `/dashboard` — protected, shows the 4 team modules
- `/dashboard/activity-recognition` — **live**, connects to your `server.py`
- `/dashboard/environmental-risk`, `/cardiovascular`, `/alerts` — one page file
  each (`src/pages/environmental|cardiovascular|alerts/`), currently placeholders
  for your teammates' components

---

## 1. Install

You need [Node.js](https://nodejs.org) 18+ installed. Then, inside this folder:

```bash
npm install
```

## 2. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and set:

```
VITE_API_BASE_URL=http://127.0.0.1:5050
```

(This should match wherever `server.py` is running — 5050 is its default port.)

Leave `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` blank for now — the
site works fine without them, it just won't save wearer sessions to a
database. See **Section 4** to set that up.

## 3. Run it

```bash
npm run dev
```

Opens at `http://localhost:5173`. Make sure `server.py` is also running
(`python server.py`) so the live Analyzer page has data to show.

> **CORS**: `server.py` already has `CORS(app)` enabled, so requests from
> the Vite dev server (a different port) are allowed without extra setup.

---

## 4. Database setup (free) — Supabase

Used to save a record every time someone starts a monitoring session
(wearer's name + timestamp). Free tier is generous (500MB, no credit
card) and works well since your teammates' components can also write to
the same project later (vitals readings, alert logs, risk-zone events —
one shared database for the whole multimodal system).

1. Go to [supabase.com](https://supabase.com) → **New project** (free).
2. Once created, go to **SQL Editor** → **New query**, paste this, run it:

```sql
create table monitoring_sessions (
  id bigint generated always as identity primary key,
  wearer_name text not null,
  started_at timestamptz not null default now()
);

alter table monitoring_sessions enable row level security;

create policy "Allow inserts from anyone"
  on monitoring_sessions for insert
  to anon
  with check (true);

create policy "Allow reads for anyone"
  on monitoring_sessions for select
  to anon
  using (true);
```

3. Go to **Settings → API**. Copy the **Project URL** and the **anon public** key.
4. Paste them into your `.env`:

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOि...
```

5. Restart `npm run dev`. Now every time someone types a name and hits
   "Start Live Monitoring," a row gets saved in `monitoring_sessions`.
   Check it under **Table Editor** in Supabase.

**Why Supabase and not Firebase?** Either works fine for this. Supabase
was chosen because it's a real Postgres database — which makes it easy
for your teammates to later add their own tables (`vitals_readings`,
`risk_zones`, `alerts_log`) in the *same* project and query everything
together for a true "multimodal" data view, and it's simple to also read
from Python (via `psycopg2` or the Supabase Python client) if `server.py`
should log predictions directly in the future.

---

## 5. Login credentials (change these before deploying anywhere real)

Hardcoded in `src/context/AuthContext.jsx`:

```
Username: admin
Password: AegisCare@2026
```

This is fine for a project demo/defense. For an actual hospital
deployment, replace this with real authentication (Supabase Auth is a
natural next step since the database is already Supabase).

---

## 6. Connecting your teammates' components

Each module has its **own page file** and its **own backend folder**
(`../backend/<module>/`, see the root README):

| Route | Page file | Backend (default port) | Status |
|---|---|---|---|
| `/dashboard/activity-recognition` | `src/pages/analyzer/Analyzer.jsx` | `backend/activity-recognition` (5050) | ✅ live |
| `/dashboard/environmental-risk` | `src/pages/environmental/EnvironmentalRisk.jsx` | `backend/environmental-risk` (5051) | placeholder |
| `/dashboard/cardiovascular` | `src/pages/cardiovascular/Cardiovascular.jsx` | `backend/cardiovascular` (5052) | placeholder |
| `/dashboard/alerts` | `src/pages/alerts/SmartAlerts.jsx` | `backend/alerts` (5053) | placeholder |

To plug a teammate's UI in, replace the `<ModuleShell />` in their page file
with their components. Routes in `src/App.jsx` already point at these files.
Backend URLs are set in `.env` (`VITE_ENV_RISK_API_URL`, `VITE_CARDIO_API_URL`,
`VITE_ALERTS_API_URL`).

---

## 7. Build for production

```bash
npm run build
```

Outputs static files to `dist/`. Deploy that folder to any static host —
**Vercel** or **Netlify** both have generous free tiers and deploy
straight from a GitHub repo (connect the repo, they auto-detect Vite,
done). Just remember to set the same environment variables
(`VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) in
the host's dashboard, since `.env` itself isn't committed to git.

> Note: if you deploy the website itself to the internet but `server.py`
> stays running on a local laptop, the live Analyzer page will only work
> while your laptop and the deployed site are reachable from each other
> (same network, or `server.py` exposed via something like ngrok/a cloud
> VM). This is normal for a hardware-connected demo — worth mentioning
> in your defense as a "next step for production" (host `server.py` on a
> small cloud VM so the dashboard works from anywhere).

---

## 8. Responsive design

Built mobile-first with Tailwind's responsive breakpoints throughout —
test with your browser's device toolbar (Chrome DevTools → Toggle
device toolbar) at 375px (mobile), 768px (tablet), and 1280px+ (desktop).
