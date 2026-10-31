# Token usage

**Interactive dashboard:** https://maya2234.github.io/language-today/tokens.html (`site/tokens.html`, data rebuilt with `python pipeline/tokens.py`).

How many tokens Language Today used, where they went, and how working practices (`/clear`, `/compact`, one long
session) and project steps (gathering data, processing data, writing code, validating) affected the total.

## Sources and method

| Source | What it gives | Measured or estimated? |
|---|---|---|
| Claude Code session transcripts (`~/.claude/projects/…/*.jsonl`) | The `usage` block of every API response: input, output, cache-write and cache-read tokens, with timestamps | **Measured** |
| Claude desktop `get_usage` | Plan usage (5-hour and weekly %) and context-window breakdown | **Measured** (snapshots at 20:50 and 22:54) |
| Classifying each model call by project step | Step totals in §4 | **Estimated**: each call is assigned a step from the tools it used (see §4) |

Each model call was counted once, deduplicated by message id. Setup: Claude Code desktop app, **Opus 5.5**
(`claude-opus-5-5`), 1M-token context window, **Pro plan** ($20/month). Dollar costs are not shown because a Pro
plan is a flat subscription, so the plan percentages are the real cost.

### How to read the token types
- **Output**: text and code the model writes. The most expensive kind per token.
- **Cache write**: new context sent for the first time (your message, tool results, files read).
- **Cache read**: the whole conversation so far, re-sent on **every** call and served from cache. It is cheap per
  token, but it grows with every turn. This is where long sessions get expensive.
- **Input (uncached)**: almost zero here, because nearly everything was cached.

## 1. Totals

| Session | Time (local) | Model calls | Output | Cache write | Cache read | Input | Peak context |
|---|---|---|---|---|---|---|---|
| Build session (`f745ad3e`) | 20:35 – 22:42 (2 h 07 m) | 170 | 261,395 | 388,664 | 49,812,821 | 376 | 434,013 |
| Docs session, this one (`6604a318`), up to the token analysis | 22:52 – | 7+ | 2,881+ | 35,926+ | 481,333+ | 18+ | ~82,000 |
| *Excluded: unrelated session (`a1c409d7`, README formatting for another project)* | 22:33 | 1 | 814 | 25,125 | 45,345 | 2 | 70,472 |

**Plan usage (measured):**

| When | 5-hour window | Weekly (all models) |
|---|---|---|
| End of phase 1–2 (20:50), context 153,970 tokens | 14% | 5% |
| After publishing and starting this docs session (22:54) | 29% | 10% |

The full build used **less than a third of one 5-hour Pro window**, so the project never came close to running out.

**About 99% of all tokens processed were cache reads**: 49.8 M of 50.5 M in the build session. The model wrote
261 k tokens, but it had to re-read its growing context 170 times to do so.

## 2. Fixed cost of every session

Context breakdown at the start of a fresh session (measured, `get_usage`):

| Category | Tokens |
|---|---|
| System tools (built-in tool definitions) | 35,471 |
| MCP tools (browser, Chrome, session, docs connectors) | 20,447 |
| System prompt | 11,199 |
| Skills list | 7,892 |
| Memory files + `CLAUDE.md` | ~500 |
| **Fixed overhead before any work** | **≈ 75,500** |

Every call pays for this, even a one-word answer. Turning off unused MCP connectors (e.g. Chrome when you are using
the built-in browser) would cut about 20 k tokens from every call.

## 3. Usage by prompt (build session, measured)

| # | Prompt (abbreviated) | Calls | Output | Cache read | Context at end |
|---|---|---|---|---|---|
| 1 | Change topic; build the atlas (specs, pipeline, app, tests) | 37 | 71,151 | 4.20 M | 159,943 |
| 2 | "0% is wrong", UI overhaul, more languages and dialects | 39 | 96,364 | 9.24 M | 307,604 |
| 3 | Israel label, regions, map quality, language pages, scraping, hello | 12 | 20,355 | 3.83 M | 336,243 |
| 4 | (resume after a cut-off) finish scrape and regions UI | 46 | 56,917 | 17.34 M | 409,031 |
| 5 | Hide empty cards | 5 | 3,272 | 2.06 M | 415,036 |
| 6 | Create GitHub repo (+ sign-in back-and-forth, 4 messages) | 21 | 6,659 | 8.85 M | 426,648 |
| 7 | Enable Pages | 7 | 3,570 | 3.00 M | 431,557 |
| 8 | "Is this agentic development?" | 1 | 1,340 | 0.43 M | 431,894 |
| 9 | "What is CLDR data?" | 1 | 733 | 0.43 M | 433,258 |
| 10 | "What is a spec?" | 1 | 1,034 | 0.43 M | 434,013 |

Prompts 3 and 4 were one request. The response was cut off mid-stream and resumed, so together they are the
largest step: 58 calls and 21.2 M cache read.

## 4. Usage by project step (build session, estimated classification)

Each model call is assigned a step from the tools it called, using the rules in `pipeline/tokens.py` (`STEP_RULES`), the same rules the dashboard uses. Tests come first, then browser use, network fetches,
running pipeline scripts, file writes, git, and reads. A call that used no tool (planning, explaining) is "other".

| Step | Calls | Output | Share of output | Cache read | Share of cache read |
|---|---|---|---|---|---|
| Processing data (running `build.py`, `regions.py` and analysis scripts) | 38 | 69,942 | 27% | 10.64 M | 21% |
| Writing code and docs (Write/Edit) | 9 | 58,128 | 22% | 2.09 M | 4% |
| Validation: browser checks | 23 | 48,811 | 19% | 5.96 M | 12% |
| Gathering data (fetch, Wikipedia, scraping) | 34 | 40,176 | 15% | 9.18 M | 18% |
| Planning, explaining, answering | 34 | 20,265 | 8% | 12.10 M | 24% |
| Validation: automated tests | 6 | 12,268 | 5% | 1.34 M | 3% |
| Reading and exploring files | 18 | 8,720 | 3% | 5.14 M | 10% |
| Git and publishing | 8 | 3,085 | 1% | 3.36 M | 7% |
| **Total** | **170** | **261,395** | | **49.81 M** | |

What this shows:
- **Writing code** used few calls but many output tokens: about 6,500 output tokens per call, because whole files
  were written at once.
- **Data work** (gathering and processing together) was the largest step: 42% of output and 39% of cache reads.
  Data work needed many small trial-and-check calls, such as probing sources, handling HTTP 429 errors and
  re-running builds.
- **Validation** used about 24% of output. Browser checks cost four times as much as the automated tests.
  Screenshots and page reads are large, so the tests are the cheap way to validate.
- **Planning and talk** wrote little but used the most cache reads (24%). Late in the session even a short answer
  re-read about 430 k tokens of context.

## 5. Effect of practices: one long session vs `/clear` vs `/compact`

**What was done:** the whole build ran in **one session with no `/clear` and no `/compact`**. Context grew from
~75 k to 434 k tokens. Auto-compact starts at 97% of the 1M window, so it never triggered.

**Measured effect of not clearing:** the cost of one call grows with the context.

| Moment | Context re-read per call |
|---|---|
| First call of a session | ~75,000 (fixed overhead) |
| End of prompt 1 | ~160,000 |
| End of prompt 2 | ~308,000 |
| Q&A at the end ("What is a spec?") | ~434,000 |
| Same kind of question in this fresh session | ~82,000 |

The three short questions at the end (prompts 8–10) wrote 3,107 tokens in total but re-read 1.30 M tokens. In a
fresh session (a new session, or after `/clear`), the same questions would have re-read about 0.25 M. **For short
questions unrelated to the current work, starting fresh was about 5× cheaper.**

**`/compact`** (summarising the conversation into a short note and continuing) was **not used, so its effect was
not measured here.** It works the same way as clearing: the next call re-reads the summary plus the fixed overhead
instead of the full history. It keeps more working knowledge than `/clear` but costs one extra summarising call.

**Trade-off seen in this project:** one long session meant Claude always remembered the data decisions, the bugs
and the earlier UI feedback. This mattered for the 0% fix and the region work, which built on everything before
them. The cost was that every later call re-read the history. A sensible pattern for the next phases:
- `/clear` between phases (e.g. after publishing). `CLAUDE.md` and `specs/STATUS.md` already let a fresh session
  pick up the work ("prepare to clear" in `CLAUDE.md`).
- `/compact` in the middle of a large phase once context passes ~300 k.
- Ask side questions ("what is a spec?") in a separate fresh session.

## 6. Raw log

`docs/log/tokens.jsonl` records the usage snapshots in machine-readable form for the planned token dashboard
(phase 5). To regenerate the numbers above, parse the `usage` field of the `assistant` entries in the session
transcripts. Count each `message.id` once.
