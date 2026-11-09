# Contribution log

Who did what in Language Today. The project uses an **agentic development** workflow. Claude Code (Opus 5.5) wrote the
code, data pipeline, tests and most documentation. Maya Tomarchio set the goals, reviewed the results, caught
problems and made the decisions.

Sources: `docs/log/prompts.jsonl`, `docs/log/progress.jsonl`, git history, and the Claude Code session transcript.
Times are local (UTC−07:00) on 2026-10-30. All commits are authored as Maya Tomarchio because they were made in her
repository on her machine. The code in them was written by Claude.

## Summary

| | Maya (user) | Claude (agent) |
|---|---|---|
| Role | Product owner and supervisor: goals, review, decisions, corrections | Implementer: specs, pipeline, app, tests, docs, deployment |
| Prompts / turns | 15 messages in the build session (6 substantive requests, plus approvals and questions) | 170 model calls, ~180 tool calls |
| Code | No direct code edits | ~2,100 lines of Python and JavaScript in `pipeline/`, `site/js/` and `tests/`, plus HTML and CSS |
| Decisions | Topic change, UI direction, Israel → "Occupied Palestine" label, installing GitHub CLI, public repo, enabling Pages | Data sources, method, file layout, test design, how to fix bugs |
| Quality control | Found the "0% could talk with you" bug; asked whether the taste skill was actually being used (it was not) | 5 test runs (30 → 44 → 52 tests); browser checks after every UI change; fixed 2 syntax errors found in the browser |

## Timeline

| Time | Maya | Claude |
|---|---|---|
| 20:27 | Changed the course project's topic from "genAI in CS" data to a world language atlas. Described the features: globe with clickable regions, language percentages, year slider, multilingual regions, "where could I talk?" tool. Pasted the course brief. | Checked the open data sources (CLDR, World Bank, Glottolog, world-atlas). Wrote `CLAUDE.md` and specs 00–02. Built `fetch.py`, `build.py` and the census anchors file (250 countries, 680 languages). Built the D3 atlas with 4 layers and checked each layer in the browser. 30/30 tests passed. Corrected one wrong test assumption (Mexico's Spanish share is 83%, not over 90%). |
| 20:58 | **Caught a data error:** "0 percent could talk with you in 2026" was wrong for many countries. Asked for a UI overhaul: icon toolbar, flat map zoomed in by default, more languages and dialects, hover tooltips, a more saturated palette, Watermelon UI components. Asked whether her taste skill was being used. | Found the root cause: CLDR has no second-language figures for 55 large countries. Added pinned Wikipedia L1+L2 tables, showed "no data" honestly and flagged lower bounds. **Admitted the taste skill had not been used**, then loaded it ("Achromatic ledger" style). Ported Watermelon UI controls (MIT licence). Added 8,618 Glottolog languages and 13,706 dialects. Extended the years to 2026. 44/44 tests passed after fixing two test expectations, with reasons given. |
| 21:22 | Asked for Israel to be labelled as occupied Palestine, click-to-centre, smaller regions (Basque Country, Sicily), region popups, a higher-quality map, a page for each language with free resources, and "hello" in every language with pronunciation and audio. | **Asked Maya how to apply the Israel label.** She chose to rename it to "Occupied Palestine" and keep the data unchanged; the decision is recorded in `meta.naming`. Built `regions.py` (4,421 admin-1 regions) and `scrape.py`. The scraper was rate-limited by Wikimedia (HTTP 429); Claude added backoff and stopped caching errors. Built the 50 m map and `language.html`. Fixed a template-literal syntax error. 52/52 tests passed. |
| 21:44 | (Resumed a response that had been cut off mid-stream.) | Finished the scrape: greetings for 228 languages (122 with IPA, 38 with audio), free courses for 124 languages, 1,345 Wikipedia and 514 Wiktionary links checked. |
| 22:09 | Asked to hide the greeting and course cards on language pages that have no data for them. | Changed the language page and checked three languages (aa, ab, sw). |
| 22:16 | Asked for a new GitHub repo on her account. **Chose to install GitHub CLI** and signed in herself with `gh auth login`. | Installed `gh` with winget, created the public repo `Maya2234/language-today` and pushed it. |
| 22:35 | Approved enabling GitHub Pages. | Added the Actions workflow and enabled Pages. Confirmed the live site works: 240 countries, no console errors. |
| 22:39 | Asked about the method: what agentic development is compared with a chatbot, what CLDR is, and what a spec is. | Answered the questions. No code changes. |
| 22:52 | Asked for this contribution log, the evaluation and reflection draft, and the token usage document. | Wrote `CONTRIBUTIONS.md`, `EVALUATION_AND_REFLECTION.md` (a draft for Maya to finish) and `TOKEN_USAGE.md`. |
| 23:05 | Asked for a web interface for token usage; approved commit and push. | Built `site/tokens.html` from the session transcripts (`pipeline/tokens.py`); 59/59 tests; deployed. |
| Oct 31, 04:28 | **Reported that map selection was glitchy.** | Measured the cause (a 584 ms frame, a wait for the region file, a hidden outline), smoothed selection and globe rotation; deployed after Maya approved. |
| Nov 9, 15:18 | **Checked the course requirements against the work** and found the validation and timeline pages missing. Asked for both. | Wrote specs 03 and 04, a review log (`docs/log/reviews.jsonl`), `pipeline/report.py`, `site/validation.html` and `site/timeline.html`; corrected two log timestamps with append-only correction entries. |

## Where Maya's supervision changed the outcome

1. **The "0% reach" bug.** The tests passed, but the result was wrong for real users. This error was found by human
   review, not by the agent. The fix (Wikipedia second-language data and honest "no data" labels) was the largest
   correction in the project.
2. **The taste skill check.** Claude had not loaded the design skill until Maya asked. After that, the UI went through
   the skill's lint and inspector gates.
3. **Political naming.** Claude asked how to label Israel instead of choosing for her. Maya made the decision, and it
   is recorded in the data's metadata.
4. **Account actions.** Maya installed the CLI, signed in, created the repo and approved Pages. Claude asked before
   every step that affected her accounts.

## Where the agent corrected itself

- It changed three test expectations, each with a reason recorded in the progress log. It did not edit the data to
  make the tests pass.
- It fixed two JavaScript syntax errors that it found by loading the pages in the browser.
- It stopped the scraper from caching HTTP 429 errors after the first run polluted the cache.
