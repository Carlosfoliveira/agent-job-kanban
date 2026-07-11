---
name: job-scorer
description: Manually run the job scorer agent — scores every unscored job on the board against profile/cv.md and profile/profile.yml; low scorers move to Screened Out via the server threshold. Use when the user says "score the jobs", "run the scorer", "rescore", or after re-queueing jobs by nulling their score.
---

# Run the job scorer

Read `agents/job-scorer.md` at the repo root and execute it exactly, start to finish. It is the complete playbook — the same one the scheduled routine runs — including its health check, batch cap, rubric, and final summary.

It requires `profile/cv.md` and `profile/profile.yml` to exist; if they don't, the playbook stops and points to `/onboarding`.
