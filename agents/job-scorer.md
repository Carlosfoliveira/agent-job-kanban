# Job Scorer Playbook

You are a scheduled agent. Run everything below start to finish, non-interactively.
Repo: `/Users/carlos/personal/agent-job-kanban`. Backend API: `http://localhost:3001` (Bun + SQLite).
Never run `git commit`.

## 0. Health check (do this first, always)

1. `curl -sf http://localhost:3001/api/health`
2. If it fails: from `/Users/carlos/personal/agent-job-kanban` run `bun run server` in the background, wait ~2s, then retry the health check once.
3. If it still fails: log the failure clearly (what you tried, what came back) and STOP. Do not proceed to any other step.
4. Treat any API response with status >= 500 at any point in this run as fatal: log it and STOP immediately. Never guess-insert data to work around an error.

## 1. Load the scoring profile

Read `/Users/carlos/personal/agent-job-kanban/profile/cv.md` and `/Users/carlos/personal/agent-job-kanban/profile/profile.yml`.

If either file is missing, log exactly:

```
profile not found — run: cp ../career-ops/cv.md ../career-ops/config/profile.yml profile/
```

and STOP. Do not score anything without the profile.

## 2. Select jobs to score

`GET http://localhost:3001/api/jobs`, then select every job where `score` is `null` — regardless of `status` (an `applied` or `interview` card with no score still needs one).

Cap the batch at 50 jobs per run. If more than 50 qualify, take the first 50 and log that the run was capped (the remainder will pick up next run).

## 3. Score each job against the profile

For each selected job, score it 1-5 on each of six blocks, then compute the global score as the weighted average, rounded to 1 decimal:

- **(A) Match with CV — 35%**: how well the job's required skills/experience line up with `cv.md` (skills lists, work history, proof points). Strong direct overlap -> 5; unrelated stack/seniority -> 1.
- **(B) North Star alignment — 25%**: fit against `target_roles.archetypes` in `profile.yml` (name/level/fit). A `primary`-fit archetype match at the right level -> 5; `adjacent`-fit or wrong level -> lower.
- **(C) Comp — 15%**: posted or reasonably inferred compensation vs. `compensation` targets in `profile.yml` (target_range, minimum). No comp data in the posting -> score 3 (neutral), do not guess a number.
- **(D) Cultural signals — 15%**: culture, growth trajectory, stability, and remote policy vs. `location.location_flexibility` / remote preference in the profile.
- **(E) Red flags — 10%, inverted**: 5 = no red flags found; deduct for blockers such as visa/work-authorization requirements conflicting with `location.visa_status`, on-site-only demands when remote is required, or dealbreaker tech stacks. A serious blocker can drag this block to 1.

Global score = `0.35*A + 0.25*B + 0.15*C + 0.15*D + 0.10*E`, rounded to 1 decimal.

**Jobs with a null or empty `description`**: still score them from `title` + `company` alone — do not skip. Set `lowConfidence: true` on these. Skipping them means they never get a score and re-queue forever, which defeats the point of this agent.

## 4. Extract tech tags

From the job description, extract 5-10 required technologies as canonical names (e.g. `"React"`, `"Node.js"`, `"TypeScript"`, `".NET"`, `"AWS"`). Only required/core technologies — leave out "nice to have" mentions. If the description is empty, it's fine to return fewer (or none).

## 5. Submit the score

`POST http://localhost:3001/api/jobs/:id/score` with:

```json
{
  "score": 3.8,
  "scoreBreakdown": {
    "cv": 4,
    "northStar": 4,
    "comp": 3,
    "cultural": 4,
    "redFlags": 5,
    "rationale": "2-3 sentence justification of the global score.",
    "lowConfidence": true
  },
  "techTags": ["React", "TypeScript", "Node.js"]
}
```

`lowConfidence` is only present/true when set in step 3 — omit it otherwise.

**The server owns the status transition.** It reads the configurable `screen_out_threshold` and moves `inbox` cards below it to `screened_out` as part of this same request. This agent never sets or patches `status` itself — do not call `PATCH /api/jobs/:id` with a status in this playbook.

If the response is `404` (job no longer exists — e.g. deleted from the board), log it and skip to the next job. Any other non-2xx response for a single job: log it and continue with the rest of the batch (do not abort the whole run over one job, unless it's a 5xx — see step 0.4).

## 6. Final summary (always print this, even on partial failure)

One paragraph covering:

- How many jobs were selected and how many were actually scored (note if the 50-job cap was hit).
- The average global score across this run's scored jobs.
- Screened-out list: every job the server moved to `screened_out`, as `Company — Title: score`.
- Low-confidence list: every job scored with `lowConfidence: true`, as `Company — Title: score`.
- Any errors, 404s, or anomalies encountered.
