# agent-job-kanban

A personal job-application kanban board. Two scheduled Claude Code agents keep it
up to date automatically: one finds new LinkedIn postings, the other reads Gmail
for application-related replies. Carlos only touches the board to drag cards and
read email snippets.

## What this is

- A kanban board (7 columns, see below) backed by a local SQLite database.
- Fed by two Claude Code agents that run on a schedule (2x/day each), not by
  manual data entry.
- Single-user, local-only. No auth, no deployment — it runs on Carlos's Mac.

## Stack

- **Backend**: Bun + [Hono](https://hono.dev) + [Drizzle ORM](https://orm.drizzle.team) over SQLite (`data/app.db`), validated with Zod.
- **Frontend**: React 19 (with the React Compiler) + Vite, [TanStack Router](https://tanstack.com/router) and [TanStack Query](https://tanstack.com/query), Tailwind CSS v4, drag-and-drop via [dnd-kit](https://dndkit.com).
- **Monorepo**: Bun workspaces (`apps/server`, `apps/web`).

## Getting started

```bash
bun install
bun run dev
```

`bun run dev` starts both apps in parallel:

- server → http://localhost:3001
- web → http://localhost:5173

The SQLite file lives at `data/app.db` (gitignored, created on first run).

## Scripts

Run from the repo root:

| Script | Command | Does |
|---|---|---|
| `bun run dev` | `bun run --filter '*' dev` | Starts server + web together (watch mode). |
| `bun run server` | `bun run --filter server dev` | Starts only the API server on :3001. |
| `bun run lint` | `bun run --filter '*' lint` | Lints both apps (ESLint). |
| `bun run test` | `cd apps/server && bun test` | Runs the server test suite (Bun's test runner). |

## Repo layout

```
apps/
  server/               Bun + Hono API
    src/
      index.ts           entrypoint, listens on :3001
      app.ts              Hono app factory, mounts routers + CORS
      db/
        schema.ts          Drizzle schema (jobs, emails tables)
        client.ts           SQLite client factory
      routes/
        jobs.ts             /api/jobs endpoints
        emails.ts            /api/emails endpoints
      *.test.ts            route tests
  web/                  React 19 + Vite frontend
    src/
      components/         board, columns, job cards, email list, etc.
      lib/                 API client, TanStack Query hooks, column/status config
agents/
  linkedin-scraper.md   Playbook for the LinkedIn scraper agent
  gmail-tracker.md      Playbook for the Gmail tracker agent
data/
  app.db                SQLite database (gitignored)
```

## The two agents

The board is populated entirely by two scheduled Claude Code sessions running
locally on Carlos's Mac. They both talk to the API only, never touch the
database directly, and both open with the same contract:

- **Health check first**: hit `GET /api/health`. If the server isn't up, start
  it (`bun run server` from the repo root, in the background), wait ~2s, and
  retry once. If it's still down, log the failure clearly and stop — no data
  is written on a guess.
- **Fail closed**: any 5xx response from the API is treated as fatal for that
  run — log it and stop rather than retry blindly or fabricate data.
- **Summarize on exit**: every run ends with a one-paragraph summary of what
  it did (jobs added, statuses changed, emails matched, etc.).

| Agent | Playbook | What it does | Schedule |
|---|---|---|---|
| LinkedIn scraper | [`agents/linkedin-scraper.md`](agents/linkedin-scraper.md) | Browses LinkedIn (via Chrome) for new job postings matching Carlos's search, checks each one against `GET /api/jobs/exists`, and inserts new ones via `POST /api/jobs` into the `inbox` column. | 2x/day |
| Gmail tracker | [`agents/gmail-tracker.md`](agents/gmail-tracker.md) | Scans Gmail for application-related messages, matches each one to a job via `GET /api/jobs/search`, attaches it with `POST /api/jobs/:id/emails` (or files it as unmatched via `POST /api/emails` if no job matches), and moves the job's `status` forward with `PATCH /api/jobs/:id` when the email implies a stage change (e.g. rejection, interview invite). | 2x/day |

Both agents require, at run time: the Mac awake, Chrome open, LinkedIn logged
in, and the Gmail MCP connector connected. If any of those aren't true, the
run should fail the health/precondition check rather than silently no-op.

### Scheduling (Claude Code Desktop — local scheduled tasks)

Cloud routines can't reach local Chrome or `localhost`, and headless
`claude -p` can't drive the Chrome extension — so these agents must be
scheduled as **local scheduled tasks in the Claude Code Desktop app**
(persistent across restarts, run on this machine):

1. Open the Claude Code Desktop app → **Routines / Scheduled tasks** → **New task (Local)**.
2. Create the two tasks below, working directory `/Users/carlos/personal/agent-job-kanban`, model **Sonnet**:

| Task | Schedule (local time) | Prompt |
|---|---|---|
| LinkedIn scraper | 09:00 and 18:00 daily | `Read /Users/carlos/personal/agent-job-kanban/agents/linkedin-scraper.md and follow it exactly.` |
| Gmail tracker | 09:30 and 18:30 daily | `Read /Users/carlos/personal/agent-job-kanban/agents/gmail-tracker.md and follow it exactly.` |

The tracker runs 30 minutes after the scraper so LinkedIn "application sent"
confirmations from a morning application session match freshly inserted cards.
If the app's scheduler only accepts one time per task, create two entries per
agent (morning + evening). Docs: https://code.claude.com/docs/en/desktop-scheduled-tasks.md

## API overview

Base URL: `http://localhost:3001`. All job/email bodies are validated with Zod
server-side; see `apps/server/src/routes/*.ts` for exact schemas.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness check, `{ok: true}`. |
| GET | `/api/jobs` | Full job list with email counts. |
| GET | `/api/jobs/exists?linkedinJobId=` | `{exists}` — dedupe check before inserting a scraped job. |
| GET | `/api/jobs/search?company=&title=` | Case-insensitive partial match on company/title, used to link an email to a job. |
| POST | `/api/jobs` | Create a job. Idempotent on `linkedinJobId` — 201 if new, 200 with `duplicate:true` if it already exists. |
| PATCH | `/api/jobs/:id` | Update a job's `status` (and/or `sortOrder`). |
| POST | `/api/jobs/:id/emails` | Attach an email to a job. Idempotent on `gmailMessageId`. |
| POST | `/api/emails` | Insert an email with no matching job (unmatched tray). Idempotent on `gmailMessageId`. |
| GET | `/api/emails/unmatched` | Emails with no `jobId` — surfaced in the UI's unmatched tray. |
| PATCH | `/api/emails/:id` | Re-link an unmatched email to a job, and/or mark it seen. |

Job `status` is one of: `inbox`, `applied`, `action_needed`, `waiting`,
`interview`, `offer`, `rejected`. Email `classification` is one of:
`confirmation`, `action_request`, `interview`, `rejection`, `offer`, `other`.

## Kanban columns

| Column | Meaning |
|---|---|
| Inbox | Newly scraped posting. Nothing has been applied yet. |
| Applied | Application submitted; no reply requiring action yet. |
| Action Needed | An email came in that needs a response from Carlos (assessment, screening call request, follow-up question). |
| Waiting | Applied and waiting to hear back — no action pending. |
| Interview | An interview has been scheduled or is in progress. |
| Offer | An offer has been received. |
| Rejected | The application was rejected. |
