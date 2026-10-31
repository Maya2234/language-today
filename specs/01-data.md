# 01 — Data pipeline spec

## Inputs (`pipeline/fetch.py` → `data/raw/`, pinned versions)
| File | Source | Used for |
|---|---|---|
| `cldr_territoryInfo.json` | cldr-core@46.0.0 | language % per country, official status, literacy, CLDR population |
| `cldr_codeMappings.json` | cldr-core@46.0.0 | ISO alpha-2 → numeric (map ids) and alpha-3 (World Bank) |
| `cldr_languages_en.json` | cldr-localenames-full@46.0.0 | English language names |
| `wb_population.json` | World Bank API SP.POP.TOTL, 1960–2024 | population time series |
| `glottolog_languages.csv` | glottolog-cldf (master) | family, coordinates, countries, macroarea, documentation years |
| `glottolog_values.csv` | glottolog-cldf (master) | AES endangerment status |
| `countries-110m.json` | world-atlas@2.0.2 | map geometry |

## Outputs (`pipeline/build.py` → `site/data/`)
- `countries.json` — `{ISO2: {name, numeric, iso3, region, subregion, pop: {year: n}, literacy, langs: [{code, pct, official, anchored}], glottolog: {count, endangered, extinct}}}`
- `languages.json` — `{code: {name, family, glottocode, lat, lon, macroarea, aes, speakers2023, countries: n}}`
- `anchors.json` — curated historical anchor points with citations (pass-through of `pipeline/historical_anchors.json`)
- `meta.json` — source versions, build time, years covered, method notes

## Rules
- R1 Language codes: CLDR codes (ISO 639-1 where it exists, else 639-3). Script/region variants (`zh_Hant`, `sr_Latn`) merge into their base language, taking the max %.
- R2 Shares are fractions of a country's whole population, 0–100 %. A country's shares may sum > 100 % (multilingualism).
- R3 Population: World Bank where available; fallback to CLDR population (flat, flagged `pop_source: "cldr"`).
- R4 Multilingualism index = Σ shares / 100, capped display at 4.0. Interpretation: average number of languages per person (upper bound — CLDR counts L1+L2).
- R5 Historical share: if anchors exist for (country, lang), linearly interpolate between anchor years and hold flat outside; the CLDR value is **not** mixed in. Otherwise share is constant (CLDR) and tagged `derived`.
- R6 Region = UN M49 region/subregion (from CLDR territoryContainment).
- R7 Glottolog counts per country use the `Countries` column, languages at level `language` only; endangerment from AES (`aes` parameter): `threatened`, `shifting`, `moribund`, `nearly extinct` → endangered; `extinct` → extinct.

## Data invariant tests (tests/test_data.py)
- Every country with geometry on the map has an entry or is listed in `meta.unmapped`.
- 0 ≤ pct ≤ 100 for every language share; anchor values also within 0–100 and years sorted.
- Population series monotonic in year keys, all positive.
- World total speakers of English, Mandarin, Hindi, Spanish within ±35 % of published reference totals (Ethnologue 2024 L1+L2: en 1.5 B, zh/cmn 1.1 B, hi 0.6 B, es 0.56 B) — sanity, not truth.
- Rebuild is deterministic (same inputs → byte-identical outputs, ignoring `meta.built_at`).
