---
name: linkedin-scraper
description: Browses LinkedIn (via Chrome) for new job postings matching the configured search, checks each one against `GET /api/jobs/exists`, and inserts new ones via `POST /api/jobs` into the `inbox` column
---

# LinkedIn Job Scraper Playbook

You are a scheduled agent. Follow these steps in order, exactly. Do not skip steps. Do not improvise data. Never run `git commit`.

## 0. Ensure Chrome has an OPEN WINDOW with the LinkedIn-logged-in profile

A running Chrome **process** is not enough: on macOS Chrome stays resident in the background after its last window closes, and with zero windows the MCP extension cannot connect. You need process AND at least one open window. The launch command below is safe to run in every case — if Chrome isn't running it starts it; if it's already running it just opens a new window in the configured profile:

```bash
open -na "Google Chrome" --args --profile-directory="Default"
```

Procedure:

1. Check the process: `pgrep -x "Google Chrome"`.
   - Not running → run the launch command, wait ~4 seconds, go to step 3.
2. Process is running → check for open windows:
   ```bash
   osascript -e 'tell application "Google Chrome" to count windows' 2>/dev/null
   ```
   - If the result is `0`, empty, or the command errors → Chrome is window-less in the background: run the launch command, wait ~3 seconds.
   - If ≥ 1 window exists, proceed as-is.
3. Verify connectivity by calling `tabs_context_mcp` with `createIfEmpty: true` (after loading Chrome tools in step 2 below). If it errors with "extension disconnected" or similar, run the launch command once more, wait ~5 seconds, and retry once. If it still fails, log "Chrome extension not connectable" and STOP.

- **Only use the profile directory configured in the launch command above** — that is the profile logged into LinkedIn (`/onboarding` sets it; find yours at `chrome://version` → "Profile Path", last path segment). If you ever observe (via screenshot or page content) that the active window belongs to a different Chrome profile, do not proceed with it; open a window in the configured profile with the launch command instead.

## 1. Health check

```
curl http://localhost:3001/api/health
```

- If this succeeds, continue to step 2.
- If it fails (connection refused / timeout): from the repo root run `bun run server` in the background, wait ~2 seconds, then retry the health check once.
- If it still fails: log the failure clearly (e.g. "Backend health check failed after retry, aborting run") and STOP. Do not proceed.
- At any later point in this run, if any API call returns a 5xx status, treat it as fatal: log the failure and STOP immediately. Never guess-insert data and never continue past a failed API call.
- Once the health check passes, fetch the banned-company list and keep it for the whole run:
  ```
  curl -s http://localhost:3001/api/banned-companies
  ```
  The list may be empty — that's normal, not an error. Pass it verbatim to every page agent in step 4.

## 2. Load Chrome tools and open the search

Call `ToolSearch` once with:

```
select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__get_page_text
```

Then:
1. Call `tabs_context_mcp` with `createIfEmpty: true`.
2. Create or reuse a tab via `tabs_create_mcp`.
3. Navigate to EXACTLY this URL — copy it verbatim, do not alter any parameter, do not "clean up" or re-encode it:

```
<YOUR_LINKEDIN_SEARCH_URL>
```

If the line above is still a placeholder rather than a real `https://www.linkedin.com/jobs/search/?...` URL (it must include `f_TPR=r86400` and `sortBy=DD` — `/onboarding` fills this in), log "search URL not configured — run /onboarding" and STOP.

## 3. Auth check

If the page shows a login wall / authwall (a login/join form instead of job results): log "LinkedIn not logged in" and STOP. Never attempt to log in, enter credentials, or click through a login prompt. The same applies to any "unusual activity" / CAPTCHA interstitial: log it and STOP.

## 4. Determine page count and dispatch page agents

1. Read the total result count from the header (e.g. "51 results"): it appears near the top of the results list; via JS you can read it from the text of the banner above the list. Compute `pages = ceil(count / 25)`, **capped at 4 pages** (the search is already limited to the past 24 hours, so more than ~100 results indicates something unexpected — process the first 4 pages and note the cap in the summary).
2. Page N corresponds to the search URL with `&start=<25 × (N-1)>` appended (page 1 = `start=0`... you may omit `start` for page 1 since the tab is already there).
3. **If there is more than 1 page, run pages in parallel**: spawn one subagent per page via the `Agent` tool, all in a single message so they run concurrently. Give each agent: the exact page URL (verbatim base URL + its `start` offset), the full text of the "Page procedure" section below, the banned-company list from step 1 (verbatim, even if empty), and the API reference. Each agent must create its **own tab** (`tabs_context_mcp`, then `tabs_create_mcp`) and work only in that tab.
4. If there is only 1 page, execute the Page procedure yourself in the current tab.
5. Collect every agent's summary and aggregate them for the final summary. Because the feed can shift while agents run, two agents may occasionally process the same job — this is safe: `POST /api/jobs` is idempotent on `linkedinJobId` (the loser gets `duplicate:true`; don't count it as an insert, don't treat it as an error).

## 5. Page procedure (run per page, in its own tab)

### 5a. Collect the 25 job IDs — no scrolling needed

Navigate to the page URL, wait for the list to render, then run:

```js
Array.from(document.querySelectorAll('[data-occludable-job-id]')).map(li => li.getAttribute('data-occludable-job-id'))
```

The `data-occludable-job-id` attribute is present on ALL rows immediately, **even unhydrated placeholder rows** — you do not need to scroll or hydrate anything to collect IDs. (See "Known quirks" below if you're tempted to read titles from the list.)

If this selector matches nothing, inspect the DOM yourself, find the current equivalent, adapt, and note the drift in the final summary.

### 5b. Batch-check all IDs against the API

Check every collected ID in one Bash loop **before** extracting anything:

```bash
for id in <id1> <id2> ...; do
  echo "$id: $(curl -s "http://localhost:3001/api/jobs/exists?linkedinJobId=$id")"
done
```

- IDs with `exists:true` are already in the system — skip them individually. **Do not stop the run because of one duplicate**: reposts and promoted items shuffle the newest-first order, so new jobs routinely appear *below* known ones.
- IDs with `exists:false` are the work list for this page.
- If **every** ID on the page already exists, the page yields nothing — report "entire page duplicates" in your summary (see stop rule in step 6).

### 5c. Extract and insert each new job

For each `exists:false` ID, in order:

1. Navigate your tab directly to `https://www.linkedin.com/jobs/view/<id>`. (Direct navigation avoids the virtualized-list click dance entirely, which is what makes parallel pages safe.)
2. **Force the tab to render, then wait for the description to hydrate.** The job-view page hydrates the "About the job" panel ONLY when the tab actually renders a frame. Background/hidden tabs never render, so the panel stays a skeleton loader FOREVER — no amount of waiting helps, and this is exactly the situation for every parallel page agent (only one tab in the window is visible). A `computer` screenshot forces Chrome to render the tab even when hidden, which triggers hydration within ~2s:
   1. Take a `computer` screenshot of your tab (action: `screenshot`). You don't need to look at it — its purpose is the forced render.
   2. Check hydration with a cheap JS probe: `document.querySelector('main').innerText.includes('About the job')`.
   3. If `false`: wait 2s, screenshot again, re-probe. Repeat up to 5 cycles (~15s total).
   4. Still `false` after 5 cycles → treat as render failure: log the job id and reason, **SKIP** this job only, continue to the next. Do not stop the run for this. (Genuinely description-less listings exist but are rare — never conclude "no description" without completing all 5 forced-render cycles.)
3. **Read the FULL page text with `get_page_text`** (NOT `javascript_tool` — see Known quirks: its output truncates at ~1k chars). `get_page_text` returns the entire page text in one call with no length limit. Parse from it:
   - **company** = 1st non-empty line, **title** = 2nd, **locLine** = 3rd (looks like `Brazil · 1 hour ago · 13 applicants`).
   - **location** = the part of locLine before the first `·`; **posted-relative** = the `N <unit> ago` fragment of locLine (a `Reposted` prefix is fine).
   - **workplaceType** = the first standalone line among the pill lines (between locLine and `Easy Apply`/`Apply`) that is exactly `Remote`, `Hybrid`, or `On-site`.
   - **description** = everything from the line `About the job` up to (not including) the first of these end markers: `Set alert for similar jobs`, `This job alert is on` (shown instead when an alert already exists), `Put your best foot forward`, `Applicants for this job`, `More jobs`, `LinkedIn Corporation`. Strip a trailing `… more` line if present. (The full text is present in the DOM even while visually collapsed behind the `… more` button — expanding is not required for extraction.)
   - **NEVER truncate, cap, summarize, or paraphrase the description. Store the full text verbatim, however long it is.** A multi-KB description is expected and fine. If you catch yourself shortening it "to save tokens", stop — full fidelity is the whole point of this scraper; the job-scorer agent depends on it.
   - **Banned-company check**: as soon as you have **company**, compare it case-insensitively (exact match, not substring) against the banned-company list you were given. On a match: do NOT proceed to postedAt conversion or the POST — record the job as skipped with reason "banned company", and move on to the next id. Only continue below if the company is not banned.
4. **postedAt as ISO**: convert the relative text at extraction time (relative text like "14 minutes ago" is useless a day later). One small `javascript_tool` call:
   ```js
   function toIso(txt){
     const m = (txt||'').match(/(\d+)\s+(minute|hour|day|week|month)s?\s+ago/i);
     if(!m) return txt; // unparseable: store the raw text
     const ms = {minute:6e4, hour:36e5, day:864e5, week:6048e5, month:2592e6}[m[2].toLowerCase()];
     return new Date(Date.now() - (+m[1])*ms).toISOString();
   }
   toIso("<posted-relative text>");
   ```
   ("Reposted 16 hours ago" parses fine — the regex ignores the prefix.)
5. POST via **curl from Bash** (heredoc for the JSON body):
   ```json
   {
     "linkedinJobId": "<id>",
     "title": "<title>",
     "company": "<company>",
     "location": "<location>",
     "workplaceType": "<Remote|Hybrid|On-site>",
     "description": "<full description text>",
     "url": "https://www.linkedin.com/jobs/view/<id>",
     "postedAt": "<ISO timestamp from toIso()>",
     "status": "inbox"
   }
   ```
   The response is compact (`{duplicate, id}`): `201 {duplicate:false, id}` = inserted, count it; `200 {duplicate:true, ...}` = race, don't count it, don't treat as error. A `200 {banned:true}` response means the company was banned server-side (the ban list may have changed mid-run) — treat it exactly like a banned-company skip: not an insert, not an error; record it as skipped with reason "banned company".
6. Pace yourself: the forced-render cycles already space out navigations; don't remove them to go faster. Do not hammer LinkedIn with rapid-fire navigations — if you hit an unusual-activity/CAPTCHA page, stop your page immediately and report it.

### 5d. Page summary

Return: page number, IDs found, how many already existed, list of inserted jobs (id + title + company), list of render-failure/other skipped jobs (id + reason), list of banned-company skips (count + company names) reported separately, any selector drift, any LinkedIn interstitial encountered.

## 6. Stop rules (orchestrator)

- Natural end: all pages (up to the cap) processed.
- If a page reports **entire page duplicates**, pages after it are very likely all duplicates too — but since page agents run in parallel and each inserts only its own `exists:false` items, no action is needed; idempotency makes over-processing harmless.
- If running sequentially (single page or fallback): stop after the first page that yields zero new jobs, or after 2 consecutive pages where duplicates were the majority.
- If ANY page hit an authwall/CAPTCHA, or any API call returned 5xx, surface that as the run's stop reason.

## 7. Final summary

End every run — success, early stop, or error — by printing one paragraph covering:

- Total jobs inserted (count only true `duplicate:false` inserts), aggregated across all page agents.
- List of render-failure/other skipped jobs (id/title + reason), aggregated across all page agents.
- Banned-company skips, reported separately: count + the company names, aggregated across all page agents.
- The stop reason: `all pages processed` / `entire page duplicates` / `page cap reached` / `error: <description>`.
- Any selector drift any agent had to work around.

## Known quirks (read before improvising)

- **Hidden tabs never hydrate the job description** (root cause of the 2026-07-10 bad run): the `/jobs/view/<id>` page loads its "About the job" panel only when the tab renders a frame. A hidden/background tab renders nothing, so the panel sits on skeleton loaders indefinitely — a 45s poll was observed to find nothing, then a single `computer` screenshot (which forces a render even for hidden tabs) hydrated it within ~2s. Parallel page agents share one window, so all but one tab is always hidden: the screenshot-then-probe loop in 5c.2 is MANDATORY, not an optimization. Never interpret a skeleton as "this job has no description".
- **`javascript_tool` output truncates at ~1k chars** — a full description read through it needs a dozen chunked calls, and past agents "solved" that by capping the description (data corruption). Use `get_page_text` for anything long; it returns full page text in one call. Keep `javascript_tool` for short probes and computed values only.
- **`/jobs/view/` pages have obfuscated CSS class names**: `#job-details` and `.job-details-jobs-unified-top-card__*` exist only on the search page's right-hand pane, NOT on standalone job-view pages (which ship hashed classes like `_1aa780e9`). On job-view pages, parse from text structure (see 5c.3), not selectors.
- **Virtualized list hydration**: on the search results page, only rows near the viewport are hydrated with title/company text; the rest are empty placeholders. Setting `scrollTop` via JavaScript does NOT trigger hydration — only **real mouse scrolls** (the `computer` tool's `scroll` action on the list) do. This playbook avoids the problem by never needing hydrated list text (IDs are always present; details come from `/jobs/view/<id>`), but if you ever must read the list, use real mouse scrolls — and know that mouse actions need tab focus, so they are NOT safe while parallel agents share the browser.
- **In-page `fetch` to the local API is CSP-blocked**: LinkedIn's Content-Security-Policy silently blocks `fetch('http://localhost:3001/...')` from `javascript_tool` — the call returns an empty result and nothing reaches the API. Always POST/GET the API via `curl` from Bash.
- **Chrome extension disconnects**: the extension can drop mid-run ("Selected Chrome extension disconnected"). Call `tabs_context_mcp` (without `createIfEmpty`) to re-attach and retry the failed call once before treating it as an error.
- **The result set mutates mid-run**: the count can grow and items can shift between pages while you work. This is why order-based assumptions (like "first duplicate means everything below is known") are unreliable, and why inserts are idempotent.

## API reference

- `GET /api/health` — health check.
- `GET /api/banned-companies` → `{ companies: [{ id, name, createdAt }] }` — fetched once in step 1; keep the list for the whole run and pass it verbatim to every page agent.
- `GET /api/jobs/exists?linkedinJobId=<id>` → `{ exists }`
- `POST /api/jobs` `{ linkedinJobId, title, company, location, workplaceType, description, url, postedAt, status? }` → `201 { duplicate: false, id }` (inserted), `200 { duplicate: true, id }` (already existed), or `200 { banned: true }` (company is banned server-side, nothing inserted). Idempotent on `linkedinJobId`.
- `GET /api/jobs/search?company=<q>&title=<q>` → `{ jobs }` (case-insensitive partial match; use short distinctive fragments) — available if you need to cross-check a job, not required for the core flow.
- `PATCH /api/jobs/:id` `{ status?, description? }` — status one of `screened_out|inbox|applied|action_needed|waiting|interview|offer|rejected`; `description` allows repairing a job whose description was scraped badly — not used in the core flow, listed for reference.
- `POST /api/jobs/:id/emails` `{ gmailMessageId, gmailThreadId, subject, sender, snippet, receivedAt, classification }` — idempotent on `gmailMessageId` — not used in this playbook.
- `POST /api/emails` — same shape, no job — idempotent — not used in this playbook.
- `GET /api/jobs` → `{ jobs }` full list — available for debugging, not required for the core flow.
