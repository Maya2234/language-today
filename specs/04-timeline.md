# 04 — Timeline and contributions

## Goal
A web page (`site/timeline.html`) that documents the project timeline and separates Maya's contributions from
Claude's: every prompt and its response summary, every progress entry, commit, test run and review step, with
timestamps.

## Data
`pipeline/report.py` writes `site/data/timeline.json` from:
- `docs/log/prompts.jsonl` — Maya's prompts and Claude's response summaries (actor: user)
- `docs/log/progress.jsonl` — Claude's timestamped progress entries (actor: claude). Entries with
  `kind: "correction"` fix the timestamp of an earlier entry; the logs stay append-only.
- `git log` — commits (made in Maya's repo; code written by Claude)
- `docs/log/tests.jsonl` — one event per test run
- `docs/log/reviews.jsonl` — review findings and decisions (actor as recorded)
The file carries `source` and `method` fields.

## Page
| Section | Content |
|---|---|
| KPI row | sessions/days, prompts by Maya, decisions and review findings by Maya, Claude progress entries, commits |
| Activity by day | bars per day, split by actor |
| Timeline | events grouped by day, newest first or oldest first; filter by actor and kind; search; a prompt expands to Claude's response summary |
| Roles | Maya's vs Claude's contribution summary |

## Acceptance
- Every log line and commit appears once, in time order (tested).
- Works at phone width and in dark mode; linked from the atlas.
