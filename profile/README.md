# profile/

Scoring inputs for the `job-scorer` agent: your resume and preferences, read
fresh on every run.

- `cv.md` — resume/CV in Markdown (skills, experience, proof points).
- `profile.yml` — target roles, compensation targets, location/visa status,
  narrative.

## Populating

Run the `/onboarding` skill in Claude Code from the repo root — it generates
both files from your resume plus a short interview (and personalizes the
agent playbooks while it's at it). You can also edit the files by hand
afterwards; the scorer reads them fresh each run.

## Why gitignored

This repo may be public. `cv.md` and `profile.yml` contain personal data
(name, contact info, compensation targets, immigration/visa status) that must
never be committed. `.gitignore` excludes everything under `profile/` except
this README and `.gitkeep`, so the directory itself still exists in a fresh
clone — just run `/onboarding` to populate it.
