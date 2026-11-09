# Language Today

An interactive atlas of which languages are spoken where, by how many people, and how that changed from 1960 to 2024.
It also has a "where could I talk?" tool: enter the languages you speak to see where people are most likely to understand you.

Built with agentic, spec-driven development using Claude Code. See `specs/` for the specs, `specs/STATUS.md` for progress, and `docs/log/` for the logs.

**Live site:** https://maya2234.github.io/language-today/  
Project pages: [validation report](https://maya2234.github.io/language-today/validation.html) · [timeline and contributions](https://maya2234.github.io/language-today/timeline.html) · [token usage](https://maya2234.github.io/language-today/tokens.html)  
Repository: https://github.com/Maya2234/language-today

## Evaluation

Agentic development is a much faster approach to project implemenation than AI assisted development. I think the tradeoff is that you sacrifice learning from the development of the project because you are further removed from the actual implementation and components. In my opinion, agentic development is best suited for creating projects with technology you are already familiar with, and don't have as much to gain from a more involved approach, whether that be by hand or even AI asissted. 

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
- English Wikipedia second-language speaker tables (English, French, German, Russian, Portuguese), pinned to reviewed revisions
- Curated census anchor points for documented language shifts (`pipeline/historical_anchors.json`, with citations)

Every figure is tagged `measured` (a census value), `estimated` (interpolated between census years) or `derived` (a CLDR share × population).

## Evaluation
> Evaluating the project for how well it meets the initial goals. This step will be completed primarily by you, not
> Claude. But you can use Claude to get you information you need for this evaluation.

The evaluation is in [EVALUATION_AND_REFLECTION.md](EVALUATION_AND_REFLECTION.md). Claude gathered the facts (what was
built for each user goal, the evidence and known limits, and the status of each course deliverable); the judgements
and the reflection are Maya's. Supporting evidence: the [validation report](https://maya2234.github.io/language-today/validation.html),
the [timeline and contributions](https://maya2234.github.io/language-today/timeline.html) and
[token usage](https://maya2234.github.io/language-today/tokens.html) pages.

## Credits
Interface controls adapted from [Watermelon UI](https://github.com/WatermelonCorp/watermelon-platform) (MIT). Typeface: Geist.
