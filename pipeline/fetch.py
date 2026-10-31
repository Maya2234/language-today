"""Download pinned open-data inputs into data/raw/. Skips files that already exist (use --force to refetch)."""
import sys
import urllib.request
from pathlib import Path

RAW = Path(__file__).resolve().parent.parent / "data" / "raw"
CLDR = "46.0.0"
# Second-language (L1+L2) speaker tables, pinned to the revision that was reviewed.
WIKIPEDIA = {
    "en": ("List of countries by English-speaking population", 1379399265),
    "fr": ("Geographical distribution of French speakers", 1379390459),
    "de": ("Geographical distribution of German speakers", 1379876187),
    "ru": ("Geographical distribution of Russian speakers", 1374595124),
    "pt": ("Portuguese-speaking world", 1380645261),
}
SOURCES = {
    "cldr_territoryInfo.json": f"https://cdn.jsdelivr.net/npm/cldr-core@{CLDR}/supplemental/territoryInfo.json",
    "cldr_codeMappings.json": f"https://cdn.jsdelivr.net/npm/cldr-core@{CLDR}/supplemental/codeMappings.json",
    "cldr_territoryContainment.json": f"https://cdn.jsdelivr.net/npm/cldr-core@{CLDR}/supplemental/territoryContainment.json",
    "cldr_aliases.json": f"https://cdn.jsdelivr.net/npm/cldr-core@{CLDR}/supplemental/aliases.json",
    "cldr_languages_en.json": f"https://cdn.jsdelivr.net/npm/cldr-localenames-full@{CLDR}/main/en/languages.json",
    "cldr_territories_en.json": f"https://cdn.jsdelivr.net/npm/cldr-localenames-full@{CLDR}/main/en/territories.json",
    "wb_population.json": "https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&per_page=20000&date=1960:2024",
    "glottolog_languages.csv": "https://raw.githubusercontent.com/glottolog/glottolog-cldf/master/cldf/languages.csv",
    "glottolog_values.csv": "https://raw.githubusercontent.com/glottolog/glottolog-cldf/master/cldf/values.csv",
    **{f"wikipedia_{lang}.json": "https://en.wikipedia.org/w/api.php?action=parse&format=json&formatversion=2"
       f"&prop=text|revid&oldid={rev}" for lang, (_, rev) in WIKIPEDIA.items()},
    "countries-110m.json": "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json",
    "countries-50m.json": "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json",
    "ne_10m_admin1.geojson": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson",
}


def main(force=False):
    RAW.mkdir(parents=True, exist_ok=True)
    for name, url in SOURCES.items():
        dest = RAW / name
        if dest.exists() and not force:
            print(f"have  {name}")
            continue
        print(f"fetch {name} <- {url}")
        req = urllib.request.Request(url, headers={"User-Agent": "LanguageToday/0.2 (course project; data pipeline)"})
        with urllib.request.urlopen(req, timeout=600) as r:
            dest.write_bytes(r.read())


if __name__ == "__main__":
    main(force="--force" in sys.argv)
