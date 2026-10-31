# Status (updated 2026-10-30, session 1, second request)

## Done
- Phase 1 data pipeline: CLDR 46 + World Bank (projected to 2026) + Glottolog (8,618 languages, 13,706 dialects)
  + pinned Wikipedia L1+L2 tables (en, fr, de, ru, pt) + 14 census anchor series
- Phase 2 atlas: flat map default (zoomed), globe toggle, icon toolbar right, 4 layers, hover tooltip with languages,
  search over all languages and dialects, dialect points, year slider to 2026, honest "no data" / lower-bound reach
- UI style: taste-skill app sheet "Achromatic ledger" (seed 1160862325) + Watermelon UI (MIT) controls in plain CSS
- Tests: 44/44 (`python pipeline/run_tests.py --phase <name>`)

## Known gaps
- No second-language figures for e.g. South Korea, Vietnam (shown as no data / lower bound)
- English total ~2.1 B (Wikipedia ability counts) vs Ethnologue 1.5 B
- Inspector FAIL rainbow-chart kept on purpose (user asked for a saturated multi-colour language map)
- Census anchors still unverified

## Next
1. User review of the new UI
2. Verify census anchors; consider Spanish (Instituto Cervantes) and Arabic L2 sources
3. Phase 3 validation dashboard → 4 timeline → 5 token dashboard → 6 publish (GitHub + Pages)
