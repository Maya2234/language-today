# 00 — Project spec: Language Today

## Goal
An interactive web atlas of **which languages are spoken where, by how many people, and how that changed over time**,
plus a "where could I communicate?" tool for people who speak several languages.

## Users and their questions
| # | Question the user wants answered | Feature |
|---|---|---|
| U1 | What languages are spoken in this place, in what proportions? | Click a country on a globe/map → language breakdown panel |
| U2 | How many people speak language X, and where are they? | Language search → choropleth of share of population, speaker totals, top countries |
| U3 | How have speaker numbers changed over time? | Year slider (1960–latest) driving map and panels |
| U4 | Which regions are most multilingual, and in which languages? | Multilingualism view: index per country/region, top second languages |
| U5 | If I speak languages A, B, C — where can I most likely talk to people? | "My languages" inputs with proficiency → reachability map |
| U6 | How diverse is a region linguistically, and how endangered are its languages? | Region panel: count of languages, endangerment breakdown (Glottolog) |

## Data sources (open, citable)
- **Unicode CLDR** `territoryInfo` — per-country population, literacy, and % of population speaking each language
  (L1 + L2 combined; sums over 100 % indicate multilingualism). Official status per language.
- **World Bank** `SP.POP.TOTL` — population by country, 1960 → latest.
- **Glottolog** (CLDF) — every language's family, coordinates, macroarea, and AES endangerment status.
- **Curated census anchors** (`pipeline/historical_anchors.json`) — documented shifts in language share for selected
  countries (e.g. Mandarin in China, Spanish in the US, Indonesian in Indonesia) with the census/report each figure comes from.

## Method (summary; details in 01-data.md)
- speakers(country, lang, year) = population(country, year) × share(country, lang, year)
- share(year) = CLDR share (dated to CLDR release) unless curated anchors exist, then linear interpolation between anchors.
- Every number shown in the UI carries a provenance tag: `measured` (source value), `derived` (pop × share), or `estimated` (interpolated).

## Non-goals
- Sub-national maps (e.g. Welsh in Wales) — country level only in v1.
- Pre-1960 history (no comparable population series).

## Phases
| Phase | Spec | Deliverable |
|---|---|---|
| 1 | `01-data.md` | Reproducible data pipeline + data invariant tests |
| 2 | `02-atlas-app.md` | Globe/map atlas with U1–U6 |
| 3 | `03-validation-dashboard.md` | Web page to search/filter test runs and evidence |
| 4 | `04-timeline.md` | Web page: project timeline, user vs Claude contributions, prompts |
| 5 | `05-token-dashboard.md` | Web page: token usage by phase and practice (clear/compact) |
| 6 | `06-publish.md` | GitHub repo + GitHub Pages |

## Global acceptance criteria
- `python pipeline/build.py` regenerates all `site/data` from `data/raw` deterministically.
- All tests pass; the test log is written to `docs/log/tests.jsonl`.
- The app works as a static site (no server code) and at phone width.
