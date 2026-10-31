# 02 — Atlas app spec

Static site in `site/` (D3 7.9 + topojson-client 3.1 from jsdelivr). Pure logic in `site/js/logic.js`, UI in `site/js/app.js`.

## Features → user questions (00-project.md)
| Feature | Covers | Acceptance |
|---|---|---|
| Globe (drag to rotate, wheel/pinch to zoom) and flat Equal Earth map (pan/zoom) | all | Toggle keeps layer and selection |
| **Languages** layer: most spoken language per country (12-colour legend by population; others in muted tones; Arabic varieties coloured as Arabic) | U1 | Hover tooltip names the language |
| Language picker → share-of-population choropleth + language panel (speakers, countries, family, trend 1960–latest, top countries) | U2, U3 | Selecting from any panel list switches to this view |
| Country click → panel: population, languages per person, living/endangered languages, all language shares with provenance tags, census trend charts, subregion second languages, languages lost since 1960, full Glottolog list with filter | U1, U4, U6 | Every share shows `measured` / `estimated` / `derived` |
| **Multilingualism** layer: Σshares/100; continent + subregion tables with top second languages; top 15 countries | U4 | |
| **Diversity** layer: Glottolog living languages at the slider year (log scale); extinction trend since 1960 | U6, U3 | |
| **Where can I talk?** layer: add languages with level (native, fluent, conversational, basic); map = 1 − Π(1 − w·p); panel: people reachable, by continent, best countries, which language does most work; country panel shows bounds | U5 | Inputs persist in localStorage (guarded) |
| Year slider 1960–2024 with play | U3 | Map, legend and panels update together |
| "Data & method" dialog: sources, method, provenance tags, anchor table with citations and confidence | trust | |

## Logic tests (tests/js/logic.test.mjs)
interpolate, popAt clamping, provenance tagging, breakdown, multilingualIndex, reachability (single, combined, weights,
unknown language, estimate within bounds), languageTotal, topLanguages with anchors, regionSummary, livingLanguagesAt, formatCount.

## Known limitations
- CLDR shares are a single recent snapshot; without anchors, change over time reflects population only.
- Anchor metrics differ (mother tongue vs ability vs home language); the anchored series replaces CLDR's L1+L2 figure.
- CLDR lists Standard Arabic and colloquial varieties separately, which raises the multilingualism index in North Africa.
- Small territories without World Bank data use CLDR population held flat.
