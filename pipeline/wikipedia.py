"""Parse pinned Wikipedia speaker tables (data/raw/wikipedia_<lang>.json) into {ISO2: percent of population}.

Only country-level tables are read: a table whose first header is "Territory" lists sub-national units and is skipped.
In each row the first cell that names a country and the first cell shaped like "12.3%" are taken; for the English
table that is "Total %", i.e. first + additional-language speakers.
"""
import html
import json
import re
import unicodedata
from pathlib import Path

RAW = Path(__file__).resolve().parent.parent / "data" / "raw"

ALIASES = {
    "dr congo": "CD", "democratic republic of the congo": "CD", "congo, democratic republic of the": "CD",
    "republic of the congo": "CG", "congo": "CG", "ivory coast": "CI", "cote d'ivoire": "CI", "myanmar": "MM",
    "burma": "MM", "czech republic": "CZ", "czechia": "CZ", "swaziland": "SZ", "eswatini": "SZ", "east timor": "TL",
    "timor-leste": "TL", "vatican city": "VA", "palestine": "PS", "state of palestine": "PS", "macedonia": "MK",
    "north macedonia": "MK", "united states of america": "US", "usa": "US", "uk": "GB", "great britain": "GB",
    "people's republic of china": "CN", "china": "CN", "taiwan": "TW", "republic of china": "TW", "cape verde": "CV",
    "cabo verde": "CV", "gambia": "GM", "the gambia": "GM", "bahamas": "BS", "the bahamas": "BS", "micronesia": "FM",
    "federated states of micronesia": "FM", "south korea": "KR", "korea, south": "KR", "north korea": "KP",
    "russia": "RU", "russian federation": "RU", "laos": "LA", "syria": "SY", "iran": "IR", "vietnam": "VN",
    "brunei": "BN", "moldova": "MD", "turkey": "TR", "turkiye": "TR", "hong kong": "HK", "macau": "MO", "macao": "MO",
    "netherlands": "NL", "the netherlands": "NL", "kosovo": "XK", "guinea bissau": "GW", "sao tome and principe": "ST",
    "saint kitts and nevis": "KN", "saint lucia": "LC", "saint vincent and the grenadines": "VC", "falkland islands": "FK",
    "congo-brazzaville": "CG", "congo-kinshasa": "CD", "timor leste": "TL", "united states virgin islands": "VI", "us virgin islands": "VI", "british virgin islands": "VG",
}


def norm(name):
    name = unicodedata.normalize("NFKD", html.unescape(name)).encode("ascii", "ignore").decode()
    name = re.sub(r"\[.*?\]|\(.*?\)", "", name).replace("&", "and").replace("St.", "Saint").replace("’", "'")
    return re.sub(r"\s+", " ", name).strip().strip("*†‡").strip().lower()


def name_index(territory_names):
    idx = {}
    for key, name in territory_names.items():
        code = key.split("-alt-")[0]
        if len(code) == 2 and code.isalpha():
            idx.setdefault(norm(name), code)
    idx.update(ALIASES)
    return idx


def cells(row):
    parts = re.split(r"<t[dh][^>]*>", row)[1:]
    out = []
    for p in parts:
        p = re.sub(r"<sup.*?</sup>", "", p, flags=re.S)
        out.append(re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", p))).strip())
    return out


def parse(lang, territory_names):
    page = json.loads((RAW / f"wikipedia_{lang}.json").read_text(encoding="utf8"))["parse"]
    idx = name_index(territory_names)
    found, unmatched, territories = {}, set(), []
    for table in re.findall(r'<table class="wikitable[^"]*".*?</table>', page["text"], re.S):
        rows = re.findall(r"<tr.*?</tr>", table, re.S)
        if not rows:
            continue
        if (cells(rows[0]) or [""])[0].lower().startswith("territory"):  # sub-national: territory, country, ..., %
            for row in rows[1:]:
                cs = cells(row)
                pct = next((float(m.group(1)) for c in cs[2:] if (m := re.fullmatch(r"([\d.]+)\s*%", c))), None)
                year = next((int(c) for c in cs[2:] if re.fullmatch(r"(19|20)\d\d", c)), None)
                if len(cs) > 2 and pct is not None and norm(cs[1]) in idx:
                    territories.append({"territory": re.sub(r"\[.*?\]", "", cs[0]).strip(), "country": idx[norm(cs[1])],
                                        "lang": lang, "pct": min(100.0, pct), "year": year,
                                        "title": page["title"], "revid": page["revid"]})
            continue
        for row in rows[1:]:
            cs = cells(row)
            code = next((idx[norm(c)] for c in cs if norm(c) in idx), None)
            pct = next((float(m.group(1)) for c in cs if (m := re.fullmatch(r"([\d.]+)\s*%", c))), None)
            if code and pct is not None and code not in found:
                found[code] = min(100.0, pct)
            elif pct is not None and not code and cs and cs[0] and not cs[0][0].isdigit():
                unmatched.add(cs[0])
    return {"revid": page["revid"], "title": page["title"], "shares": dict(sorted(found.items())),
            "unmatched": sorted(unmatched), "territories": territories}
