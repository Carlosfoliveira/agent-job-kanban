---
name: onboarding
description: First-time setup wizard for this repo — collects the user's resume and a short interview to generate profile/cv.md and profile/profile.yml, personalizes the three agent playbooks (repo paths, LinkedIn search URL, Chrome profile), installs them as Claude Desktop scheduled-task skills, and walks through scheduling. Use when a new user says "set me up", "onboard me", "create my profile", "configure this for me", asks how to start using the board after cloning, or when an agent reports the profile files are missing.
---

# Onboarding Wizard

Turn a fresh clone into a fully personalized, agent-driven job board. Ask questions **one topic at a time**, prefill everything possible from the resume, and never invent facts about the user.

## 0. Preflight

1. Resolve the repo root: `git rev-parse --show-toplevel`. Call it `$REPO` below.
2. Check `bun --version`; if missing, point to https://bun.sh and stop until installed.
3. Check `$REPO/profile/cv.md` and `$REPO/profile/profile.yml`:
   - Both exist → ask whether to **update** (keep files, revisit answers) or **start fresh**.
   - Missing → full run.

## 1. Resume intake → `profile/cv.md`

Ask for the resume: a file path (PDF, DOCX, or Markdown), pasted text, or a LinkedIn-profile export. Read it, then write `$REPO/profile/cv.md` as clean Markdown:

- Header: name + contact links.
- Professional summary (2-3 sentences).
- Skills grouped by area (languages, frameworks, cloud/infra, AI/ML, etc.).
- Experience: company, role, dates, 3-5 bullets each — keep every quantified metric from the original; do not add numbers that aren't there.
- Education / certifications.

The job-scorer weighs CV match at 35%, so completeness beats brevity — include all roles and skills, not a summary. Show the generated file and confirm before continuing.

## 2. Interview → `profile/profile.yml`

Copy `references/profile-template.yml` (in this skill's directory) as the working structure and fill it via a short interview. Draft answers from the resume first, then confirm or correct — never make the user type what the resume already says. Cover, in order:

1. **Candidate basics** — anything missing from the resume (email, LinkedIn, GitHub, location).
2. **Target roles** — 1-3 primary role titles, then archetypes: for each, name + level + fit (`primary`/`secondary`/`adjacent`). Propose these from the resume; the scorer's North Star block (25%) scores against them.
3. **Narrative** — headline, exit story, 3-5 superpowers, 2-4 proof points with hero metrics. Draft from the resume; user edits.
4. **Compensation** — target range, walk-away minimum, currency, location flexibility. Explain: postings without comp data score neutral, so these only gate postings that state a range.
5. **Location & visa** — country, city, timezone, visa status. Explain: visa conflicts are the scorer's biggest red-flag penalty, so precision matters ("no US work authorization" vs "needs sponsorship" are different signals).

Write `$REPO/profile/profile.yml`, show it, confirm.

## 3. LinkedIn search URL → scraper playbook

The scraper visits one hardcoded search URL. Have the user build it themselves — LinkedIn's location IDs (`geoId`) aren't guessable:

1. Tell the user: open https://www.linkedin.com/jobs/search/, apply your filters (keywords, location, remote/hybrid, experience level), then copy the full URL from the address bar and paste it here.
2. Validate and normalize the pasted URL:
   - Must contain `f_TPR=r86400` (past-24h — the dedupe stop rules depend on it). Add it if absent.
   - Must contain `sortBy=DD` (newest first). Add it if absent.
   - Keep every other parameter verbatim. Do not re-encode.
3. In `$REPO/agents/linkedin-scraper.md`, replace the `<YOUR_LINKEDIN_SEARCH_URL>` placeholder (or a previously configured URL) in the "Load Chrome tools and open the search" step with the normalized URL, and remove the placeholder-guard sentence below it if the URL is now real.

## 4. Personalize the playbooks

The playbooks use repo-root-relative paths, so no path rewriting is needed. Two machine-specific details remain:

1. **Chrome profile** (linkedin-scraper only): ask which Chrome profile is logged into LinkedIn — the user can find the profile directory name at `chrome://version` → "Profile Path" (the last path segment, e.g. `Default` or `Profile 2`). Rewrite the playbook's step-0 launch command (`--profile-directory="..."`) if it differs from the default.
2. Defensive check: grep each playbook for any leftover absolute path (`/Users/...`-style) from a previous owner and replace it with `$REPO` if found.
3. Leave everything else in the playbooks untouched — the "Known quirks" sections encode hard-won LinkedIn workarounds.

## 5. Install as scheduled-task skills

The Claude Desktop scheduled tasks read copies at `~/.claude/scheduled-tasks/<name>/SKILL.md`, which must stay **byte-identical** to the repo playbooks:

```bash
for a in linkedin-scraper job-scorer gmail-tracker; do
  mkdir -p ~/.claude/scheduled-tasks/$a
  cp "$REPO/agents/$a.md" ~/.claude/scheduled-tasks/$a/SKILL.md
done
```

Verify each pair with `diff` (must be empty). Tell the user: any future playbook edit is a two-file edit — repo copy AND the scheduled-task copy.

## 6. Schedule the routines & finish

Print a closing checklist, filling in `$REPO`:

1. **Start the stack**: `bun install && bun run dev` (or `docker compose up -d --build`). Board at http://localhost:5173.
2. **Create three local scheduled tasks** in the Claude Desktop app (Routines → New task → **Local**), working directory `$REPO`, model Sonnet:

   | Task | Time (local) | Prompt |
   |---|---|---|
   | LinkedIn scraper | 09:00 & 18:00 | `Read $REPO/agents/linkedin-scraper.md and follow it exactly.` |
   | Job scorer | 09:15 & 18:15 | `Read $REPO/agents/job-scorer.md and follow it exactly.` |
   | Gmail tracker | 09:30 & 18:30 | `Read $REPO/agents/gmail-tracker.md and follow it exactly.` |

   Keep the stagger: scraper → scorer (+15m) → tracker (+30m), so new jobs are scored and screened before emails try to match them.
3. **Connect Gmail** (tracker only): the Gmail MCP connector must be connected in the Desktop app, read-only use.
4. **Preconditions at run time**: Mac awake; Chrome running and logged into LinkedIn (scraper only).
5. **Smoke test now**: with the server running, offer to run `/linkedin-scraper` once to confirm Chrome/LinkedIn/API all connect, then `/job-scorer` to confirm the profile scores jobs. (Each agent is a project skill — `/linkedin-scraper`, `/job-scorer`, `/gmail-tracker` — runnable on demand any time.)
6. **Tune later**: screen-out threshold and banned companies live in the board's Settings gear (top right).
