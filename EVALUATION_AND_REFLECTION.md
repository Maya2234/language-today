# Evaluation and reflection

> **DRAFT — to be completed by Maya.** The course brief says this evaluation is "completed primarily by you, not
> Claude." Claude gathered the facts and evidence below. The judgements, ratings and the reflection are Maya's to
> write. Every place marked **✍️ Maya** needs her words. Facts come from `specs/`, `docs/log/` and the live site
> (checked 2026-10-30).

## 1. Project goal

> An interactive web atlas of which languages are spoken where, by how many people, and how that changed over
> time, plus a "where could I communicate?" tool for people who speak several languages. (`specs/00-project.md`)

## 2. User goals (U1–U6)

| # | User question | What was built | Evidence | Known limits | ✍️ Maya: met? (yes / partly / no) and why |
|---|---|---|---|---|---|
| U1 | What languages are spoken here, in what proportions? | Click a country or region to open a breakdown panel. Hovering shows a tooltip with its languages. 4,421 sub-national regions with 280 regional shares. | Browser-checked; tests in `tests/` | Region shares are curated or taken from Wikipedia for only some regions | |
| U2 | How many people speak language X, and where? | Search across 8,618 languages and 13,706 dialects. Choropleth map, speaker totals, top countries. A page for each language. | Search and language-page checks | English total is ~2.1 B (Wikipedia ability counts), against Ethnologue's ~1.5 B | |
| U3 | How have speaker numbers changed over time? | Year slider from 1960 to 2026 | Interpolation tests in `node --test tests/js` | Only 14 countries have real census anchor series, and those are **not yet verified**. Elsewhere the share is held constant and only population changes. 2025–26 population is projected. | |
| U4 | Which regions are most multilingual? | Multilingualism layer (index for each country) | Layer browser-checked | Depends on CLDR shares adding up to more than 100%. Countries missing second-language data look less multilingual than they are. | |
| U5 | If I speak A, B, C, where can I talk to people? | "Where can I talk" layer with a proficiency setting for each language. Shows "no data" and lower bounds honestly. | Fixed after Maya found the 0% bug; tests added | No second-language data for e.g. South Korea and Vietnam | |
| U6 | How diverse and endangered are a region's languages? | Diversity layer; Glottolog endangerment and family data | Data invariant tests | Country level, plus region points | |

Extra features beyond the spec: "hello" in 228 languages (122 with IPA, 38 with audio), free learning resources for
124 languages, "Occupied Palestine" label (Maya's decision), click-to-centre, 50 m map.

## 3. Course deliverables

| Deliverable | Status | Where |
|---|---|---|
| Spec-driven development | Done for phases 0–2. Specs 03–06 are listed but not written. | `specs/` |
| Data pipeline, reproducible from open data | Done | `pipeline/fetch.py`, `pipeline/build.py` |
| Validation: tests | Done: 5 logged runs, latest 52/52 passing | `docs/log/tests.jsonl` |
| Validation: web interface to browse test evidence | **Not started** (phase 3) | — |
| Timeline / contributions | Done as a document; **web page not started** (phase 4) | `CONTRIBUTIONS.md` |
| Token usage documentation | Done as a document; **web interface not started** (phase 5) | `TOKEN_USAGE.md` |
| Published on GitHub and the web | Done | https://github.com/Maya2234/language-today · https://maya2234.github.io/language-today/ |
| Evaluation and reflection | This draft | this file |

## 4. Accuracy, efficiency and validity of the agent's code

Facts that may help you judge this:

- **Accuracy:** The tests passed while U5 showed "0% could talk with you" for countries where many people speak
  English. Tests check internal consistency, not whether the result is true in the real world. A human found the
  error. The census anchors are still unverified, and the English total is high compared with Ethnologue.
- **Honesty of figures:** Every figure is tagged `measured`, `derived` or `estimated`. Missing data shows as
  "no data" instead of 0.
- **Validity of tests:** Three test expectations were changed during the build, each with a reason in the progress
  log (Mexico's Spanish share, the English total band, and how Glottolog classifies dialects). ✍️ Maya: do you agree
  these were real test errors and not the agent bending tests to fit the data?
- **Efficiency:** About 2,100 lines of code. The pipeline is stdlib-only Python and the site has no build step.
  The token cost of the build is in `TOKEN_USAGE.md`: one 2 h 07 m session that used 29% of a 5-hour Pro window at
  its peak.
- **Bugs the agent caught itself:** Two syntax errors found in the browser, and the scraper caching HTTP 429 errors.

✍️ Maya — overall judgement:

_…_

## 5. What I would do next

Suggestions from the status file; edit or reorder them:

1. Verify the 14 census anchor series against their cited sources.
2. Find second-language sources for Spanish (Instituto Cervantes), Arabic, Korean and Vietnamese.
3. Build the validation dashboard, the timeline page and the token dashboard under `site/`.

✍️ Maya:

_…_

## 6. Reflection: agentic vs AI-assisted development

The course asks: *How do you feel about an agentic development approach vs an AI-assisted development approach (if
you have a basis for comparison)?*

Prompts to help you write it (delete them when you're done):

- **Basis for comparison:** Your previous project (UI Project 2: EasyVisa) — how did you work with AI there? Did you
  copy code from a chat, or let it edit files?
- **Control:** You wrote no code here. Did you feel in charge of the project? When did you trust the agent, and when
  didn't you? (Examples: the 0% bug, the taste skill question.)
- **Understanding:** Near the end you asked what agentic development, CLDR and a spec are. How well do you
  understand what was built? Does that matter to you?
- **Speed vs. checking:** The whole build took about two hours. How much of your time went into reviewing compared
  with directing?
- **Decisions:** Claude asked you about the Israel/Palestine label and about installing GitHub CLI. Did it ask about
  the right things — too much, too little?
- **Cost:** About 29% of a 5-hour Pro window for the build (see `TOKEN_USAGE.md`). Was it worth it?
- **Would you use it again?** For what kinds of projects would you choose agentic, AI-assisted or no AI?

✍️ Maya:

_…_
