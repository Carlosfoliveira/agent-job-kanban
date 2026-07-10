# Gmail Job-Tracker Playbook

You are a scheduled agent. Run everything below start to finish, non-interactively.
Repo: `/Users/carlos/personal/agent-job-kanban`. Backend API: `http://localhost:3001` (Bun + SQLite).

## 0. Health check (do this first, always)

1. `curl -sf http://localhost:3001/api/health`
2. If it fails: from `/Users/carlos/personal/agent-job-kanban` run `bun run server` in the background, wait ~2s, then retry the health check once.
3. If it still fails: log the failure clearly (what you tried, what came back) and STOP. Do not proceed to any other step.
4. Treat any API response with status >= 500 at any point in this run as fatal: log it and STOP immediately. Never guess-insert data to work around an error.

## 1. Load tools

Call `ToolSearch` once with `select:mcp__claude_ai_Gmail__search_threads,mcp__claude_ai_Gmail__get_thread` to load the Gmail MCP tools before using them.

**Gmail is READ-ONLY for this task.** Never send, reply, label, archive, or delete mail. Only `search_threads` and `get_thread` are allowed.

## 2. Find candidate emails

Companies rarely email only through LinkedIn — most follow-ups (assessments, interview invites, rejections) come from the company's own domain or an ATS, often with subjects that don't contain obvious keywords. So run **three** kinds of searches with `search_threads` and dedupe threads across them:

1. Keyword/LinkedIn pass:
   `newer_than:2d in:anywhere {from:jobs-noreply@linkedin.com from:linkedin.com subject:application subject:interview subject:assessment subject:offer subject:recruiter subject:applying}`
2. **Board-driven company pass** (this is what catches direct-from-company mail):
   - Fetch `GET /api/jobs` and collect the distinct company names on the board.
   - For each company, derive a short distinctive search fragment: strip legal/generic suffixes (`Inc`, `LLC`, `Group`, `Co`, `Corp`, `Ltd`, `Global`, `Solutions`, `Consulting`, `Oficial`, `do Brasil`) and keep the distinctive part — e.g. "Gramian Consulting" -> `"Gramian"`, "Emma of Torre.ai" -> `"Torre.ai"`, "Sigma Software Group" -> `"Sigma Software"`.
   - **Skip fragments that are common English/Portuguese words** ("Reply", "FullStack", "Montreal", "Worldly", "WE ARE HIRING") — they return noise, not signal. A fragment is usable if it would be surprising to see in a non-job email.
   - Chunk the fragments ~10 per query and run one search per chunk:
     `newer_than:2d in:anywhere {"frag1" "frag2" ... "frag10"}`
     Quoted phrases match sender names, subjects, AND bodies, so this finds company mail regardless of the sending address.
3. Spam sweep (job-related mail sometimes lands in spam):
   `in:spam newer_than:2d`
   From the results, keep only threads that look job-related (application/interview/assessment/offer/recruiter/rejection language, or from known ATS domains).

From all passes, keep only threads that are genuinely job-related. Discard LinkedIn job-alert digests, connection/InMail social notifications, billing emails, and newsletters that merely mention a company name.

Known senders/domains in Carlos's inbox to recognize as job-related: `jobs-noreply@linkedin.com`, `linkedin.com`, `workablemail.com`, `ashbyhq.com`, `greenhouse-mail.io`, `teamtailor-mail.com`, `deel.com`, `coderpad.io`, `micro1.ai`, `torre.ai`, `hirehangar.com`, `breakmarkhr.com`, `luflox.com`, `unlockcareer.ai`, `proxify.io`, `gympass.com` (Wellhub's ATS sender), `rippling.com` (ATS, e.g. `ats.rippling.com`), `devsu.com`. **When a run discovers a new job-related sender domain not in this list, append it to this list in both copies of this playbook** (`agents/gmail-tracker.md` in the repo and `~/.claude/scheduled-tasks/gmail-tracker/SKILL.md`) so future runs recognize it.

For each candidate thread, call `get_thread` to pull the message(s): `gmailMessageId`, `gmailThreadId`, `subject`, `sender`, a short `snippet` (body excerpt, a sentence or two), and `receivedAt`.

## 3. Classify each message

Assign exactly one classification:
- `confirmation` — application received/sent acknowledgement
- `action_request` — they need something from Carlos (question, form, assessment invite requiring action)
- `interview` — interview or assessment scheduling
- `rejection` — rejected/moving forward with other candidates
- `offer` — job offer
- `other` — anything job-adjacent that doesn't fit the above

## 4. Match each message to a job card

For each candidate message (do this before deciding whether to skip it — see step 5):

1. Extract the company name and role title from the email using ALL available signals:
   - subject and snippet/body text
   - **sender domain**: `no-reply@torre.ai` -> "Torre.ai", `recruiting@luflox.com` -> "Luflox". The domain is often the strongest company signal when the body doesn't name the company (ATS mail like coderpad.io excepted — that domain identifies the tool, not the company; look in the subject/body instead).
   - **thread continuity**: if another message in the same `gmailThreadId` was already matched to a job (this run or a previous one), the new message belongs to the same job — reuse that job id without re-searching.
2. Normalize the company name: strip legal suffixes like `Inc`, `LLC`, `Group`, `Co`, `Corp`, `Ltd`.
3. Call `GET /api/jobs/search?company=<fragment>` using a short, distinctive fragment of the normalized name. If that's ambiguous, also try `GET /api/jobs/search?title=<fragment>` with a role-title fragment.
4. Judge the candidates returned. Email company names often differ slightly from the LinkedIn listing (e.g. "Gramian Consulting Group" in an email vs. "Gramian Consulting" on the job card) — use judgment, but only match when you're genuinely confident it's the same job/company. **Never invent or force a match.**
   - Company match alone is NOT enough when the email names a clearly different role than the card (e.g. an email about "Customer Service Representative" at a company whose card is "Front-End UI Developer") — unless it's obviously the same hiring pipeline (recruiters sometimes send generic-role InMails for a specific application). When the email explicitly references *applying* and the timing lines up with the card, prefer matching; when it reads like an unrelated vacancy, leave unmatched.
   - If a company has multiple cards on the board (e.g. micro1), match by role title; if no title fits, leave unmatched rather than guessing.
5. Confident match found -> a job id to use in step 6.
6. No confident match -> treat as unmatched (step 6 uses `/api/emails` instead).

## 5. Skip already-processed messages

The insert endpoints are idempotent on `gmailMessageId` (a `duplicate:true` / 200 response means it was already recorded — no error, just nothing new happened). Since idempotency is enforced server-side, you don't need to pre-check; just always attempt the POST in step 6 for every candidate message you triaged, and rely on `duplicate:true` to tell you it was a no-op. Do the job-matching in step 4 first, then do the POST as the last action for that message.

## 6. Record the email

- Confident job match (job id `X`) -> `POST /api/jobs/X/emails` with `{gmailMessageId, gmailThreadId, subject, sender, snippet, receivedAt, classification}`.
- No confident match -> `POST /api/emails` with the same fields (no job id).
- If the response says `duplicate:true` (or equivalent already-exists signal), do not re-triage the card for this message — move to the next message.

## 7. Auto-triage the matched job card

Only for messages that got a **new** (non-duplicate) match in step 6, and only via `PATCH /api/jobs/:id {status}`.

Pipeline order (never move a card backwards):
`screened_out < inbox < applied < action_needed < waiting < interview < offer|rejected`

Rules:
- `confirmation` -> `applied`, but only if the card is currently `inbox` or `screened_out`.
- Plain acknowledgement / "still reviewing" (treat as `confirmation` with no forward content, i.e. classification is `confirmation` but nothing new happened) -> `waiting`, but only if the card is currently `applied`.
- `action_request` -> `action_needed`.
- `interview` -> `interview`.
- `rejection` -> `rejected` (always allowed, regardless of current stage).
- `offer` -> `offer` (always allowed, regardless of current stage).
- `other` -> do not change status.
- If a rule's target stage is not strictly ahead of the card's current stage in the pipeline order above, do not patch — leave it.
- When genuinely torn between two possible triage moves for the same message, pick the less advanced one — except rejection/offer, which always apply regardless of current stage.
- Fetch current status first if needed via `GET /api/jobs` (full list) or by inspecting the search result from step 4.

## 8. Retro-match previously unmatched emails

After processing new mail, fetch `GET /api/emails/unmatched`. For each email there, re-run the step-4 matching logic (sender domain, company/role extraction, thread continuity). Cards are sometimes added to the board *after* the email arrived, so an email unmatched last run may match now.

- Confident match found -> `PATCH /api/emails/:id {jobId: X}` to link it, then apply the step-7 triage rules to card X using that email's classification (same never-move-backwards constraints).
- Still no match -> leave it; do not dismiss anything.

## 9. Final summary (always print this, even on partial failure)

One paragraph covering:
- How many candidate emails were found and processed (and which search pass surfaced them)
- How many matched to a job card vs. were recorded as unmatched (`/api/emails`)
- How many previously unmatched emails were retro-linked in step 8
- How many were duplicates/already processed (skipped)
- Every card status change, as `Company — Role: old_status -> new_status`
- Any errors or anomalies encountered
