---
name: linkedin-scraper
description: Manually run the LinkedIn scraper agent — browses the configured LinkedIn job search in Chrome and inserts new postings into the board's Inbox. Use when the user says "run the scraper", "check for new jobs", "scrape LinkedIn now", or wants to trigger the scraper outside its 09:00/18:00 schedule.
---

# Run the LinkedIn scraper

Read `agents/linkedin-scraper.md` at the repo root and execute it exactly, start to finish. It is the complete playbook — the same one the scheduled routine runs — including its health check, Chrome/profile setup, stop rules, and final summary.

Preconditions the playbook enforces itself (do not pre-check beyond it): API on :3001 (it starts the server if down), Chrome with an open window, LinkedIn logged in. If the search URL still points at someone else's search, run `/onboarding` first.
