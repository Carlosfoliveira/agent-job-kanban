---
name: gmail-tracker
description: Manually run the Gmail tracker agent — scans recent mail (read-only) for application-related messages, attaches them to matching cards, and moves statuses forward. Use when the user says "check my email", "run the tracker", "sync gmail", or wants to process replies outside the 09:30/18:30 schedule.
---

# Run the Gmail tracker

Read `agents/gmail-tracker.md` at the repo root and execute it exactly, start to finish. It is the complete playbook — the same one the scheduled routine runs — including its health check, read-only Gmail contract, matching judgment rules, and final summary.

It requires the Gmail MCP connector to be connected in this session; if the Gmail tools aren't available even via ToolSearch, stop and tell the user to connect Gmail rather than improvising.
