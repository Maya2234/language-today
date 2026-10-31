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
    REFERENCE = {"en": 1.5e9, "zh": 1.1e9, "hi": 0.6e9, "es": 0.56e9}  # Ethnologue 2024 L1+L2, rounded

    def test_speaker_totals_near_reference(self):
        for code, ref in self.REFERENCE.items():
            ratio = LANGUAGES[code]["speakers"] / ref
            self.assertTrue(0.65 <= ratio <= 1.35, f"{code}: {LANGUAGES[code]['speakers']:.3g} vs {ref:.3g}")

    def test_major_languages_have_family(self):
        expect = {"en": "Indo-European", "zh": "Sino-Tibetan", "ar": "Afro-Asiatic", "sw": "Atlantic-Congo", "ja": "Japonic"}
        for code, fam in expect.items():
            self.assertEqual(LANGUAGES[code].get("family"), fam, code)

    def test_every_language_named(self):
        unnamed = [c for c, l in LANGUAGES.items() if not l["name"] or l["name"] == c]
        self.assertLess(len(unnamed), 0.05 * len(LANGUAGES), unnamed[:20])


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
            for name in ("countries.json", "languages.json", "anchors.json", "glottolog_by_country.json"):
                self.assertEqual((Path(a) / name).read_bytes(), (Path(b) / name).read_bytes(), name)

    def test_checked_in_output_matches_fresh_build(self):
        with tempfile.TemporaryDirectory() as a:
            build.build(a)
            for name in ("countries.json", "languages.json"):
                self.assertEqual((Path(a) / name).read_bytes(), (DATA / name).read_bytes(), f"{name} is stale; run pipeline/build.py")


if __name__ == "__main__":
    unittest.main()
