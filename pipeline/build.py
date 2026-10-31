"""Build site/data/*.json from data/raw/ (see specs/01-data.md). Deterministic apart from meta.built_at."""
import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "site" / "data"
ANCHORS = Path(__file__).resolve().parent / "historical_anchors.json"
YEAR0, YEAR1 = 1960, 2024
REGIONS = {"002": "Africa", "019": "Americas", "142": "Asia", "150": "Europe", "009": "Oceania"}
ENDANGERED = {"aes-threatened", "aes-shifting", "aes-moribund", "aes-nearly_extinct"}
OFFICIAL = {"official", "de_facto_official"}


def load(name):
    return json.loads((RAW / name).read_text(encoding="utf8"))


def csv_rows(name):
    with open(RAW / name, encoding="utf8", newline="") as f:
        yield from csv.DictReader(f)


def interpolate(points, year):
    """Linear interpolation over sorted [[year, value], ...]; flat outside the range (spec R5)."""
    if year <= points[0][0]:
        return points[0][1]
    if year >= points[-1][0]:
        return points[-1][1]
    for (y0, v0), (y1, v1) in zip(points, points[1:]):
        if y0 <= year <= y1:
            return v0 + (v1 - v0) * (year - y0) / (y1 - y0)


def region_lookup(containment):
    """ISO2 -> (region name, subregion name) using UN M49 containment."""
    parent = {}
    for code, v in containment.items():
        if "-status-" in code or not code.isdigit() or code == "003":  # 003 = "North America" grouping
            continue
        for child in v["_contains"]:
            parent.setdefault(child, code)
    names = load("cldr_territories_en.json")["main"]["en"]["localeDisplayNames"]["territories"]
    out = {}
    for child, sub in parent.items():
        if child.isdigit():
            continue
        node, region = sub, None
        while node in parent or node in REGIONS:
            if node in REGIONS:
                region = REGIONS[node]
                break
            node = parent[node]
        out[child] = (region, names.get(sub, sub))
    return out


def population_series():
    """ISO3 -> {year: population} from World Bank."""
    pops = {}
    for row in load("wb_population.json")[1]:
        if row["value"] is None:
            continue
        pops.setdefault(row["countryiso3code"], {})[int(row["date"])] = int(row["value"])
    return pops


def glottolog(alias_to_cldr):
    langs = list(csv_rows("glottolog_languages.csv"))
    names = {r["ID"]: r["Name"] for r in langs}
    aes = {r["Language_ID"]: r["Code_ID"] for r in csv_rows("glottolog_values.csv") if r["Parameter_ID"] == "aes"}
    by_iso, by_country = {}, {}
    for r in langs:
        if r["Level"] != "language":
            continue
        status = aes.get(r["ID"], "")
        family = names.get(r["Family_ID"], "Isolate" if r["Is_Isolate"] == "True" else "Unclassified")
        last = int(r["Last_Year_Of_Documentation"]) if r["Last_Year_Of_Documentation"] else None
        rec = {
            "glottocode": r["ID"], "name": r["Name"], "family": family, "macroarea": r["Macroarea"],
            "lat": round(float(r["Latitude"]), 3) if r["Latitude"] else None,
            "lon": round(float(r["Longitude"]), 3) if r["Longitude"] else None,
            "aes": status.replace("aes-", "") or None, "last_documented": last,
        }
        iso = r["ISO639P3code"]
        if iso:
            by_iso[alias_to_cldr.get(iso, iso)] = rec
        for c in filter(None, r["Countries"].replace(" ", ";").split(";")):
            by_country.setdefault(c, []).append([r["Name"], family, rec["aes"], last])
    for v in by_country.values():
        v.sort()
    return by_iso, by_country


def build(out=OUT):
    info = load("cldr_territoryInfo.json")["supplemental"]["territoryInfo"]
    codes = load("cldr_codeMappings.json")["supplemental"]["codeMappings"]
    lang_names = load("cldr_languages_en.json")["main"]["en"]["localeDisplayNames"]["languages"]
    terr_names = load("cldr_territories_en.json")["main"]["en"]["localeDisplayNames"]["territories"]
    regions = region_lookup(load("cldr_territoryContainment.json")["supplemental"]["territoryContainment"])
    aliases = load("cldr_aliases.json")["supplemental"]["metadata"]["alias"]["languageAlias"]
    alias_to_cldr = {k: v["_replacement"].split("_")[0] for k, v in aliases.items()
                     if v.get("_reason") in ("overlong", "macrolanguage") and "_" not in k and " " not in v["_replacement"]}
    anchors = json.loads(ANCHORS.read_text(encoding="utf8"))
    anchored = {(s["country"], s["lang"]): s for s in anchors["series"]}
    pops = population_series()
    gl_iso, gl_country = glottolog(alias_to_cldr)

    countries, unmapped_pop = {}, []
    for iso2 in sorted(info):
        t, cm = info[iso2], codes.get(iso2, {})
        if len(iso2) != 2 or "_numeric" not in cm or iso2 == "ZZ":
            continue
        series = pops.get(cm.get("_alpha3"), {})
        if series:
            pop = [series.get(y) for y in range(YEAR0, YEAR1 + 1)]
            # fill gaps (rare) with nearest earlier, then later value
            for i in range(len(pop)):
                if pop[i] is None:
                    pop[i] = next((p for p in reversed(pop[:i]) if p), None)
            first = next(p for p in pop if p)
            pop = [p or first for p in pop]
            pop_source = "worldbank"
        else:
            pop = [int(t["_population"])] * (YEAR1 - YEAR0 + 1)
            pop_source = "cldr"
            unmapped_pop.append(iso2)
        merged = {}
        for code, lv in t.get("languagePopulation", {}).items():
            base = code.split("_")[0]
            if base in ("und", "zxx"):  # CLDR placeholders: unknown / no linguistic content
                continue
            pct = float(lv.get("_populationPercent", 0))
            prev = merged.get(base)
            off = lv.get("_officialStatus")
            if prev is None or pct > prev["pct"]:
                merged[base] = {"code": base, "pct": pct, "official": off or (prev or {}).get("official")}
            elif off and not prev["official"]:
                prev["official"] = off
        langs = []
        for m in sorted(merged.values(), key=lambda m: (-m["pct"], m["code"])):
            entry = {"code": m["code"], "pct": m["pct"]}
            if m["official"]:
                entry["official"] = m["official"]
            if (iso2, m["code"]) in anchored:
                entry["anchored"] = True
            langs.append(entry)
        for (c, l), s in anchored.items():  # anchored language missing from CLDR list
            if c == iso2 and l not in merged:
                langs.append({"code": l, "pct": s["points"][-1][1], "anchored": True})
        gl = gl_country.get(iso2, [])
        region, sub = regions.get(iso2, (None, None))
        countries[iso2] = {
            "name": terr_names.get(iso2, iso2), "numeric": cm["_numeric"], "iso3": cm.get("_alpha3"),
            "region": region, "subregion": sub, "pop": pop, "pop_source": pop_source,
            "literacy": float(t["_literacyPercent"]) if "_literacyPercent" in t else None,
            "langs": langs,
            "glottolog": {
                "count": sum(1 for g in gl if g[2] != "extinct"),
                "endangered": sum(1 for g in gl if ("aes-" + (g[2] or "")) in ENDANGERED),
                "extinct": sum(1 for g in gl if g[2] == "extinct"),
            },
        }

    def share(iso2, lang, year, pct):
        s = anchored.get((iso2, lang))
        return interpolate(s["points"], year) if s else pct

    languages = {}
    for iso2, c in countries.items():
        for l in c["langs"]:
            rec = languages.setdefault(l["code"], {"speakers": 0, "countries": 0, "official_in": []})
            rec["speakers"] += c["pop"][-1] * share(iso2, l["code"], YEAR1, l["pct"]) / 100
            rec["countries"] += 1
            if l.get("official") in OFFICIAL:
                rec["official_in"].append(iso2)
    for code, rec in languages.items():
        g = gl_iso.get(code)
        rec["name"] = lang_names.get(code) or (g or {}).get("name") or code
        rec["speakers"] = round(rec["speakers"])
        if g:
            rec.update({k: g[k] for k in ("family", "glottocode", "macroarea", "lat", "lon", "aes")})
    languages = dict(sorted(languages.items()))

    meta = {
        "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "years": [YEAR0, YEAR1],
        "sources": {
            "cldr": "Unicode CLDR 46.0 territoryInfo (language % of population, L1+L2)",
            "population": "World Bank WDI SP.POP.TOTL",
            "glottolog": "Glottolog CLDF (languages, AES endangerment)",
            "anchors": "Curated census anchors, pipeline/historical_anchors.json (unverified)",
        },
        "method": "speakers = population(year) x share(year). share is the CLDR value held constant, "
                  "or interpolated from census anchors where listed.",
        "pop_fallback_cldr": unmapped_pop,
    }
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    dump = lambda name, obj: (out / name).write_text(
        json.dumps(obj, ensure_ascii=False, separators=(",", ":"), sort_keys=False), encoding="utf8")
    dump("countries.json", countries)
    dump("languages.json", languages)
    dump("anchors.json", anchors)
    dump("glottolog_by_country.json", dict(sorted(gl_country.items())))
    dump("meta.json", meta)
    (out / "countries-110m.json").write_bytes((RAW / "countries-110m.json").read_bytes())
    return countries, languages, meta


if __name__ == "__main__":
    c, l, m = build()
    print(f"countries={len(c)} languages={len(l)} pop_fallback={m['pop_fallback_cldr']}")
    sys.exit(0)
