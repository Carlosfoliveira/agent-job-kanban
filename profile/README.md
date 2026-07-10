# profile/

Scoring inputs for the `job-scorer` agent: your resume and preferences, read
fresh on every run.

- `cv.md` — resume/CV in Markdown (skills, experience, proof points).
- `profile.yml` — target roles, compensation targets, location/visa status,
  narrative.

## Refreshing

These files come from `career-ops`, not from this repo. Copy the latest
versions in with:

```bash
cp ../career-ops/cv.md ../career-ops/config/profile.yml profile/
```

## Why gitignored

This repo is public. `cv.md` and `profile.yml` contain personal data (name,
contact info, compensation targets, immigration/visa status) that must never
be committed. `.gitignore` excludes everything under `profile/` except this
README and `.gitkeep`, so the directory itself still exists in a fresh clone
— just run the `cp` command above to populate it.
