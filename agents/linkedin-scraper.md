# LinkedIn Job Scraper Playbook

You are a scheduled agent. Follow these steps in order, exactly. Do not skip steps. Do not improvise data. Never run `git commit`.

## 1. Health check

```
curl http://localhost:3001/api/health
```

- If this succeeds, continue to step 2.
- If it fails (connection refused / timeout): from `/Users/carlos/personal/agent-job-kanban` run `bun run server` in the background, wait ~2 seconds, then retry the health check once.
- If it still fails: log the failure clearly (e.g. "Backend health check failed after retry, aborting run") and STOP. Do not proceed.
- At any later point in this run, if any API call returns a 5xx status, treat it as fatal: log the failure and STOP immediately. Never guess-insert data and never continue past a failed API call.

## 2. Load Chrome tools

Call `ToolSearch` once with:

```
select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__javascript_tool
```

Then:
1. Call `tabs_context_mcp` with `createIfEmpty: true`.
2. Create or reuse a tab via `tabs_create_mcp`.
3. Navigate to EXACTLY this URL — copy it verbatim, do not alter any parameter, do not "clean up" or re-encode it:

```
https://www.linkedin.com/jobs/search/?f_E=4&f_TPR=r86400&f_WT=2&geoId=106057199&keywords=full%20stack&origin=JOB_SEARCH_PAGE_LOCATION_AUTOCOMPLETE&refresh=true&sortBy=DD
```

## 3. Auth check

If the page shows a login wall / authwall (a login/join form instead of job results): log "LinkedIn not logged in" and STOP. Never attempt to log in, enter credentials, or click through a login prompt.

## 4. Collect the job list on the current page

The results list is virtualized — only visible rows are hydrated with real text; others render as placeholders. To collect all ~25 items on a page:

1. Run:
```js
document.querySelectorAll('[data-occludable-job-id]').length
```
2. Scroll the list container stepwise (not the whole page) and re-run the query + read title/company text after each scroll step, until every item's title and company text is populated (non-empty, not a placeholder skeleton).
3. For each `<li>`, record: `data-occludable-job-id`, title text, company text.

If this selector matches nothing, inspect the DOM yourself, find the current equivalent, adapt, and note the drift in the final summary.

## 5. Process items strictly top to bottom

The page is sorted newest-first (`sortBy=DD`), so order matters. For each collected item, in order:

1. `GET /api/jobs/exists?linkedinJobId=<data-occludable-job-id>`
2. If `exists: true` — this and everything after it on LinkedIn is already in the system. **STOP THE ENTIRE RUN immediately.** This is a hard stop, not a skip: do not process further items on this page or any further page.
3. If `exists: false` — this is a new job:
   - Click the card (scroll it into view, then click) so the right-hand detail pane loads it.
   - Wait briefly for the pane to update.
   - Read from the pane via `javascript_tool`:
     - Title, company, location, posted-time, workplace type from the top card elements: `.job-details-jobs-unified-top-card__*` (workplace type shows as a pill of text like "Remote", "Hybrid", or "On-site").
     - Full description: `document.querySelector('#job-details').innerText`.
   - If the pane fails to load after 2 attempts (retry once), log which job id/title was skipped and why, then **SKIP** this job only — continue to the next item. Do not stop the run for this.
   - Otherwise, `POST /api/jobs` with:
     ```json
     {
       "linkedinJobId": "<id>",
       "title": "<title>",
       "company": "<company>",
       "location": "<location>",
       "workplaceType": "<Remote|Hybrid|On-site>",
       "description": "<full description text>",
       "url": "https://www.linkedin.com/jobs/view/<id>",
       "postedAt": "<posted time text/derived value>",
       "status": "inbox"
     }
     ```
   - A `201` with `duplicate:false` means it was inserted; count it. A `200` with `duplicate:true` means it already existed (race condition) — do not count it as a new insert, but do not treat this as an error or a stop condition either.

## 6. Pagination

After finishing a page with no duplicate hit (i.e. every item on the page was new or skipped):

1. Click the next-page button: `button.jobs-search-pagination__button--next`.
2. If that button is absent or disabled, there are no more pages — you are done.
3. If present, click it, wait for the new page's job list to load, and repeat step 4 onward for the new page.

If this selector matches nothing, inspect the DOM, find the current equivalent, adapt, and note the drift in the final summary.

## 7. Final summary

End every run — success, early stop, or error — by printing one paragraph covering:

- Number of jobs inserted (count only true `duplicate:false` inserts).
- List of any skipped jobs (id/title + reason).
- The stop reason: `duplicate <id> encountered` / `end of results (no more pages)` / `error: <description>`.
- Any selector drift you had to work around.

## API reference

- `GET /api/health` — health check.
- `GET /api/jobs/exists?linkedinJobId=<id>` → `{ exists }`
- `POST /api/jobs` `{ linkedinJobId, title, company, location, workplaceType, description, url, postedAt, status? }` → `201 { duplicate: false }` (inserted) or `200 { duplicate: true }` (already existed)
- `GET /api/jobs/search?company=<q>&title=<q>` → `{ jobs }` (case-insensitive partial match; use short distinctive fragments) — available if you need to cross-check a job, not required for the core flow.
- `PATCH /api/jobs/:id` `{ status }` — status one of `inbox|applied|action_needed|waiting|interview|offer|rejected` — not used in this playbook, listed for reference.
- `POST /api/jobs/:id/emails` `{ gmailMessageId, gmailThreadId, subject, sender, snippet, receivedAt, classification }` — idempotent on `gmailMessageId` — not used in this playbook.
- `POST /api/emails` — same shape, no job — idempotent — not used in this playbook.
- `GET /api/jobs` → `{ jobs }` full list — available for debugging, not required for the core flow.
