# Language Today — agent instructions

Spec-driven project. The specs in `specs/` are the source of truth; read `specs/00-project.md` first,
then the spec for the phase you are working on. Status of each phase lives in `specs/STATUS.md`.

## Layout
- `pipeline/` — Python (stdlib only) that fetches open data into `data/raw/` and builds `site/data/*.json`
- `site/` — static web app (no build step; D3 + topojson from CDN). Serve with `python -m http.server -d site`
- `tests/` — `python -m unittest discover tests` (pipeline + data invariants) and `node --test tests/js` (app logic)
- `docs/log/` — append-only JSONL logs: `progress.jsonl`, `prompts.jsonl`, `tokens.jsonl`, `tests.jsonl`

## Rules
- Every work session: append a timestamped entry (ISO 8601, local time with offset) to `docs/log/progress.jsonl`;
  record the user's prompt and a summary of the response in `docs/log/prompts.jsonl`.
- After running tests, append the run summary to `docs/log/tests.jsonl` (`python pipeline/run_tests.py` does this).
- Never present estimated figures as measured. Every derived dataset carries `source` and `method` fields.
- Keep the app logic that is testable (scoring, interpolation, aggregation) in `site/js/logic.js` as pure functions.

## "Prepare to clear"
When the user says "prepare to clear": update `specs/STATUS.md` (done / in progress / next), append the progress
and prompt log entries, and note open questions. After `/clear`, resume by reading `CLAUDE.md` → `specs/STATUS.md`.
