# 05 — Token dashboard

## Goal
A web page (`site/tokens.html`, served by GitHub Pages) that shows how many tokens the project used, where they
went by project step and by prompt, and how working practice (one long session vs `/clear` / `/compact`) changed
the cost. `TOKEN_USAGE.md` is the written companion.

## Data
- `pipeline/tokens.py` reads the Claude Code session transcripts for this project
  (`~/.claude/projects/<project-slug>/*.jsonl`) and writes `site/data/tokens.json`.
- One record per model call, deduplicated by `message.id`: timestamp, context size (input + cache write + cache
  read), output, cache read, cache write, step, prompt index.
- Steps are classified from the tools each call used (rules in `tokens.py`, `method: estimated`); token counts are
  `method: measured`. Sessions unrelated to this project are excluded by id with a reason.
- Plan snapshots and context overhead come from `docs/log/tokens.jsonl` (desktop `get_usage`, measured).
- The file carries `source` and `method` fields like every derived dataset.

## Page
| Section | Form | Question it answers |
|---|---|---|
| KPI row | stat tiles | How much in total? (processed, output, calls, peak context, plan %) |
| Context per call | line over time, prompt boundaries marked, crosshair tooltip | How did context grow without `/clear`? |
| By project step | horizontal bars, metric toggle (output / cache read / calls) | Which steps cost most? |
| By prompt | horizontal bars + table | Which requests cost most? |
| Practice comparison | horizontal bars | What does a call cost fresh vs late in a long session? |
| Fixed overhead | horizontal bars | What does every call pay before any work? |

- Session selector in one filter row above the charts.
- Every chart has a table view; works at phone width and in dark mode; site style ("Achromatic ledger",
  colour only on data).
- Aggregation (totals, grouping) lives in `site/js/logic.js` as pure functions.

## Acceptance
- `python pipeline/tokens.py` regenerates `site/data/tokens.json`.
- Tests: per-session totals equal the sum of their calls; every call has a known step; `source`/`method` present;
  JS tests for the grouping functions.
- Linked from the atlas; no console errors on the live site.
