# 03 — Validation dashboard

## Goal
A web page (`site/validation.html`) that lets a skeptical reviewer see what is tested, how each test ran over time,
and the evidence (beyond tests) that the code and data are correct, including the human review steps.

## Data
`pipeline/report.py` writes `site/data/validation.json` from:
- `docs/log/tests.jsonl` — one line per test per run (measured; written by `pipeline/run_tests.py`)
- `tests/test_data.py` and `tests/js/*.test.mjs` — each test's source code, file and line, and the area it covers
- `docs/log/reviews.jsonl` — review and evidence log: human review findings, browser checks, test expectations
  changed (with the reason), bugs found and fixed. Each entry names the actor (user / claude) and the evidence.
The file carries `source` and `method` fields.

## Page
| Section | Content |
|---|---|
| KPI row | latest run result, tests, runs, failures ever recorded, review entries |
| Runs | one bar per run (pass/fail counts), click to filter the test table to that run |
| Tests | search, filter by suite / area / status; each row expands to what it checks, its code, its history across runs (pass/fail dots) and a link to the line on GitHub |
| Review log | filter by actor and kind: what was checked, by whom, what was found, outcome |
| How to reproduce | the commands to rerun every test |

## Acceptance
- Every test in the latest run appears with its source; every run in `tests.jsonl` appears.
- Test counts on the page equal the counts in `tests.jsonl` (tested).
- Works at phone width and in dark mode; linked from the atlas.
