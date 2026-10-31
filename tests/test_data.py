"""Data invariant tests for site/data (specs/01-data.md). Run: python -m unittest discover tests"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))
import build  # noqa: E402

DATA = ROOT / "site" / "data"


def load(name):
    return json.loads((DATA / name).read_text(encoding="utf8"))


COUNTRIES = load("countries.json")
LANGUAGES = load("languages.json")
ANCHORS = load("anchors.json")
META = load("meta.json")


class TestCountries(unittest.TestCase):
    def test_every_map_shape_has_country_data(self):
        world = load("countries-110m.json")
        numerics = {c["numeric"] for c in COUNTRIES.values()}
        ids = [g.get("id") for g in world["objects"]["countries"]["geometries"]]
        missing = [i for i in ids if i is not None and i not in numerics]
        self.assertEqual(missing, [], "map shapes without country data")

    def test_shares_between_0_and_100(self):
        for iso2, c in COUNTRIES.items():
            for l in c["langs"]:
                self.assertTrue(0 <= l["pct"] <= 100, f"{iso2}/{l['code']}={l['pct']}")

    def test_no_placeholder_or_variant_codes(self):
        for iso2, c in COUNTRIES.items():
            for l in c["langs"]:
                self.assertNotIn(l["code"], ("und", "zxx"), iso2)
                self.assertNotIn("_", l["code"], f"{iso2}: script/region variant not merged (R1)")

    def test_population_series_complete_and_positive(self):
        n = META["years"][1] - META["years"][0] + 1
        for iso2, c in COUNTRIES.items():
            self.assertEqual(len(c["pop"]), n, iso2)
            self.assertTrue(all(p is not None and p >= 0 for p in c["pop"]), iso2)

    def test_every_inhabited_country_has_a_region(self):
        no_region = [k for k, c in COUNTRIES.items() if not c["region"] and c["pop"][-1] > 0 and k != "AQ"]
        self.assertEqual(no_region, [])

    def test_known_facts(self):
        mx = {l["code"]: l for l in COUNTRIES["MX"]["langs"]}
        self.assertGreater(mx["es"]["pct"], 80)  # CLDR 46 lists 83%
        ca = {l["code"]: l for l in COUNTRIES["CA"]["langs"]}
        self.assertIn(ca["en"]["official"], ("official", "de_facto_official"))
        self.assertIn(ca["fr"]["official"], ("official", "de_facto_official"))
        self.assertEqual(COUNTRIES["FR"]["langs"][0]["code"], "fr")
        self.assertEqual(COUNTRIES["US"]["region"], "Americas")
        self.assertEqual(COUNTRIES["IN"]["subregion"], "Southern Asia")

    def test_population_matches_world_bank_magnitude(self):
        # 2024 World Bank: India ~1.45 B, China ~1.41 B, USA ~340 M
        self.assertAlmostEqual(COUNTRIES["IN"]["pop"][-1] / 1e9, 1.45, delta=0.05)
        self.assertAlmostEqual(COUNTRIES["CN"]["pop"][-1] / 1e9, 1.41, delta=0.05)
        self.assertAlmostEqual(COUNTRIES["US"]["pop"][-1] / 1e6, 340, delta=10)

    def test_glottolog_counts_plausible(self):
        # Glottolog lists roughly 840-880 languages for Papua New Guinea and ~450-500 for India
        self.assertTrue(800 <= COUNTRIES["PG"]["glottolog"]["count"] <= 900)
        self.assertTrue(420 <= COUNTRIES["IN"]["glottolog"]["count"] <= 520)


class TestLanguages(unittest.TestCase):
    # Ethnologue 2024 L1+L2 (rounded) and OIF 2022 for French. English uses its own band: since session 2 the
    # pipeline takes Wikipedia's self-reported-ability figures where higher, which puts English near 2.1 B.
    REFERENCE = {"zh": 1.1e9, "hi": 0.6e9, "es": 0.56e9, "fr": 0.32e9}

    def test_speaker_totals_near_reference(self):
        for code, ref in self.REFERENCE.items():
            ratio = LANGUAGES[code]["speakers"] / ref
            self.assertTrue(0.65 <= ratio <= 1.35, f"{code}: {LANGUAGES[code]['speakers']:.3g} vs {ref:.3g}")

    def test_english_total_between_survey_and_ability_counts(self):
        self.assertTrue(1.4e9 <= LANGUAGES["en"]["speakers"] <= 2.3e9, LANGUAGES["en"]["speakers"])

    def test_dialect_counts_attached(self):
        self.assertGreater(LANGUAGES["en"]["dialects"], 50)
        # Glottolog files many varieties (Bavarian, Egyptian Arabic) as languages, not as dialects of the standard
        self.assertGreater(sum(l.get("dialects", 0) for l in LANGUAGES.values()), 1500)

    def test_major_languages_have_family(self):
        expect = {"en": "Indo-European", "zh": "Sino-Tibetan", "ar": "Afro-Asiatic", "sw": "Atlantic-Congo", "ja": "Japonic"}
        for code, fam in expect.items():
            self.assertEqual(LANGUAGES[code].get("family"), fam, code)

    def test_every_language_named(self):
        unnamed = [c for c, l in LANGUAGES.items() if not l["name"] or l["name"] == c]
        self.assertLess(len(unnamed), 0.05 * len(LANGUAGES), unnamed[:20])


class TestSecondLanguages(unittest.TestCase):
    """Session 2: Wikipedia L1+L2 tables fill second-language gaps that made reach show 0%."""

    def share(self, iso2, code):
        return next((l for l in COUNTRIES[iso2]["langs"] if l["code"] == code), None)

    def test_known_gaps_filled(self):
        for iso2, low in {"JP": 15, "NO": 70, "ID": 15, "UA": 30, "RU": 1}.items():
            l = self.share(iso2, "en")
            self.assertIsNotNone(l, f"{iso2} has no English figure")
            self.assertGreaterEqual(l["pct"], low, iso2)

    def test_wikipedia_never_lowers_a_cldr_share(self):
        for iso2, c in COUNTRIES.items():
            for l in c["langs"]:
                if l.get("src") == "wikipedia" and l["cldr_pct"] is not None:
                    self.assertGreater(l["pct"], l["cldr_pct"], f"{iso2}/{l['code']}")

    def test_wikipedia_revisions_pinned(self):
        for lang, w in META["wikipedia"].items():
            self.assertIsInstance(w["revid"], int, lang)
            self.assertGreater(w["countries"], 20, lang)

    def test_wikipedia_parser_reads_country_rows_only(self):
        import wikipedia
        terr = json.loads((ROOT / "data" / "raw" / "cldr_territories_en.json").read_text(encoding="utf8"))
        r = wikipedia.parse("de", terr["main"]["en"]["localeDisplayNames"]["territories"])
        self.assertNotIn("England", r["shares"])  # sub-national rows skipped
        self.assertGreater(r["shares"]["AT"], 80)


class TestProjection(unittest.TestCase):
    def test_years_extend_to_projection(self):
        self.assertEqual(META["years"], [1960, 2026])
        self.assertEqual(META["projected_from"], 2025)

    def test_projection_continues_recent_trend(self):
        for iso2 in ("IN", "NG", "JP", "US"):
            pop = COUNTRIES[iso2]["pop"]
            recent, projected = pop[64] / pop[59], pop[66] / pop[64]
            self.assertAlmostEqual(projected, recent ** 0.4, places=3, msg=iso2)


class TestGlottologIndex(unittest.TestCase):
    INDEX = load("glottolog_index.json")
    DIALECTS = load("dialects.json")

    def test_index_covers_all_languages(self):
        self.assertGreater(len(self.INDEX), 8500)

    def test_dialects_point_at_indexed_languages(self):
        missing = [g for g in self.DIALECTS if g not in self.INDEX]
        self.assertEqual(missing, [])
        self.assertGreater(sum(len(v) for v in self.DIALECTS.values()), 13000)

    def test_dialect_counts_consistent(self):
        for gid, e in self.INDEX.items():
            self.assertEqual(e[7], len(self.DIALECTS.get(gid, [])), gid)


class TestAnchors(unittest.TestCase):
    def test_anchor_series_well_formed(self):
        for s in ANCHORS["series"]:
            key = f"{s['country']}/{s['lang']}"
            self.assertIn(s["country"], COUNTRIES, key)
            for field in ("metric", "source", "confidence"):
                self.assertTrue(s.get(field), f"{key} missing {field}")
            self.assertIn(s["confidence"], ("high", "medium", "low"), key)
            years = [p[0] for p in s["points"]]
            self.assertEqual(years, sorted(set(years)), f"{key} years not strictly increasing")
            self.assertTrue(all(0 <= p[1] <= 100 for p in s["points"]), key)

    def test_anchored_languages_flagged_in_countries(self):
        for s in ANCHORS["series"]:
            flagged = [l for l in COUNTRIES[s["country"]]["langs"] if l["code"] == s["lang"]]
            self.assertTrue(flagged and flagged[0].get("anchored"), f"{s['country']}/{s['lang']}")


class TestPipeline(unittest.TestCase):
    def test_interpolate(self):
        pts = [[2000, 10.0], [2010, 30.0]]
        self.assertEqual(build.interpolate(pts, 1990), 10.0)
        self.assertEqual(build.interpolate(pts, 2005), 20.0)
        self.assertEqual(build.interpolate(pts, 2020), 30.0)

    def test_build_is_deterministic(self):
        with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
            build.build(a)
            build.build(b)
            for name in ("countries.json", "languages.json", "anchors.json", "glottolog_by_country.json",
                         "glottolog_index.json", "dialects.json"):
                self.assertEqual((Path(a) / name).read_bytes(), (Path(b) / name).read_bytes(), name)

    def test_checked_in_output_matches_fresh_build(self):
        with tempfile.TemporaryDirectory() as a:
            build.build(a)
            for name in ("countries.json", "languages.json"):
                self.assertEqual((Path(a) / name).read_bytes(), (DATA / name).read_bytes(), f"{name} is stale; run pipeline/build.py")


if __name__ == "__main__":
    unittest.main()


class TestRegions(unittest.TestCase):
    """Session 3: Natural Earth admin-1 regions with Glottolog languages and regional shares."""
    INDEX = load("regions_index.json")

    def regions(self, iso2):
        return load(f"regions/{iso2}.json")

    def test_major_countries_have_regions(self):
        for iso2 in ("US", "ES", "IT", "IN", "FR", "GB", "CN", "BR"):
            self.assertGreater(self.INDEX[iso2]["regions"], 10, iso2)

    def test_every_curated_share_lands_on_a_region(self):
        curated = json.loads((ROOT / "pipeline" / "regional_shares.json").read_text(encoding="utf8"))["series"]
        unmatched = META["regions"]["unmatched_shares"]
        for s in curated:
            self.assertNotIn(f"{s['country']}/{s['region']}", unmatched)

    def test_known_regions(self):
        es = {r["name"]: r for r in self.regions("ES")}
        self.assertEqual([(s["lang"], s["pct"]) for s in es["Barcelona"]["shares"]], [("ca", 81.2)])
        self.assertIn("eu", [s["lang"] for s in es["Gipuzkoa"]["shares"]])
        gindex = load("glottolog_index.json")
        sicily = {gindex[g][0] for r in self.regions("IT") if r["parent"] == "Sicily" for g in r["langs"]}
        self.assertIn("Sicilian", sicily)

    def test_shares_in_range_and_sourced(self):
        for iso2 in self.INDEX:
            for r in self.regions(iso2):
                for s in r["shares"]:
                    self.assertTrue(0 <= s["pct"] <= 100, f"{iso2}/{r['name']}")
                    self.assertTrue(s["source"] and s["metric"], f"{iso2}/{r['name']}")

    def test_rings_closed_and_wound_for_d3(self):
        import regions as admin1
        for iso2 in ("ES", "US", "ID"):
            for r in self.regions(iso2):
                for poly in r["geom"]:
                    for i, ring in enumerate(poly):
                        self.assertEqual(ring[0], ring[-1], r["name"])
                        self.assertEqual(admin1.area(ring) < 0, i == 0, f"{r['name']} ring {i} winding")


class TestNamingAndLearning(unittest.TestCase):
    def test_israel_shown_as_occupied_palestine(self):
        self.assertEqual(COUNTRIES["IL"]["name"], "Occupied Palestine")
        self.assertEqual(META["naming"]["IL"]["sources"], "Israel")
        self.assertEqual(COUNTRIES["PS"]["name"], "Palestinian Territories")

    def test_learning_links_are_https_and_typed(self):
        learn = load("learn.json")
        self.assertGreater(len(learn), 150)
        for code, e in learn.items():
            for r in e["resources"]:
                self.assertTrue(r["url"].startswith("https://"), r["url"])
                self.assertIn(r["kind"], ("course", "textbook", "dictionary", "reference"))
            h = e.get("hello")
            if h:
                self.assertTrue(h["word"], code)
                if "audio" in h:
                    self.assertTrue(h["audio"].startswith("https://upload.wikimedia.org/"), h["audio"])

    def test_known_free_courses_found(self):
        learn = load("learn.json")
        titles = lambda c: " ".join(r["title"] for r in learn[c]["resources"])
        self.assertIn("Duolingo", titles("es"))
        self.assertIn("Language Transfer", titles("sw"))
        self.assertIn("Live Lingua", titles("am"))
