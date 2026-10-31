# Language Today

An interactive atlas of which languages are spoken where, by how many people, and how that changed from 1960 to 2024.
It also has a "where could I talk?" tool: enter the languages you speak to see where people are most likely to understand you.

Built with agentic, spec-driven development using Claude Code. See `specs/` for the specs, `specs/STATUS.md` for progress, and `docs/log/` for the logs.

## Run
```bash
python pipeline/fetch.py        # download pinned open data into data/raw/
python pipeline/build.py        # build site/data/*.json
python -m http.server 8765 -d site
python pipeline/run_tests.py --phase dev
```

## Data
- Unicode CLDR 46 `territoryInfo`: share of each country's population speaking each language (first and second language combined)
- World Bank population, 1960–2024
- Glottolog: language families, locations, endangerment, last year documented
- Curated census anchor points for documented language shifts (`pipeline/historical_anchors.json`, with citations)

Every figure is tagged `measured` (a census value), `estimated` (interpolated between census years) or `derived` (a CLDR share × population).
