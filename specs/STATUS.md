# Status (updated 2026-10-30, end of session 1)

## Done
- Phase 1 data pipeline (`pipeline/`): CLDR 46 + World Bank + Glottolog + 14 census anchor series → `site/data/`
- Phase 2 atlas (`site/`): globe/flat map, 4 layers, year slider, panels, method dialog
- Tests: 30/30 pass (`python pipeline/run_tests.py --phase <name>` logs to `docs/log/tests.jsonl`)
- Logs started: progress, prompts, tokens, tests (`docs/log/*.jsonl`)

## Next
1. User review of the atlas (run: `python -m http.server 8765 -d site`)
2. Verify census anchors in `pipeline/historical_anchors.json` against primary sources (compiled by Claude, unverified)
3. Phase 3 validation dashboard (`specs/03-validation-dashboard.md` to write) reading `docs/log/tests.jsonl`
4. Phase 4 timeline/contributions page reading `progress.jsonl` + `prompts.jsonl`
5. Phase 5 token dashboard reading `tokens.jsonl` (record usage at every clear/compact)
6. Phase 6 publish: GitHub repo + Pages (needs user's GitHub account; `gh` CLI not installed)

## Open questions for the user
- More anchor series (e.g. Kazakh/Russian in Kazakhstan, Quechua in Bolivia, Swahili in Tanzania)?
- Add sub-national data later (Wales, Catalonia, Quebec)?
