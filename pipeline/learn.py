"""Map scraped greetings and free learning resources (data/raw/scrape/scraped.json) onto the atlas's language codes."""
import json
import re
from pathlib import Path

RAW = Path(__file__).resolve().parent.parent / "data" / "raw" / "scrape" / "scraped.json"

# Course-site slugs whose names differ from the CLDR / Glottolog English name.
SLUG_ALIASES = {
    "bengali": "bn", "cambodian": "km", "chewa": "ny", "chinyanja": "ny", "haitian": "ht", "filipino": "fil",
    "ilonggo": "hil", "ilokano": "ilo", "indonesian": "id", "farsi": "fa", "persian": "fa", "pashto": "ps",
    "swahili": "sw", "kirundi": "rn", "kinyarwanda": "rw", "setswana": "tn", "sesotho": "st", "isixhosa": "xh",
    "isizulu": "zu", "siswati": "ss", "crioulo": "pov", "fula": "ff", "pulaar": "fuc", "kyrgyz": "ky",
    "msa": "ar", "egyptian": "arz", "moroccan": "ary", "levantine": "apc", "tunisian": "aeb", "iraqi": "acm",
    "mandarin": "zh", "cantonese": "yue", "greek": "el", "hebrew": "he", "malagasy": "mg", "tok": "tpi",
}
KIND_ORDER = {"course": 0, "textbook": 1, "dictionary": 2, "reference": 3}


def build(languages, gindex, alias_to_cldr):
    if not RAW.exists():
        return None
    d = json.loads(RAW.read_text(encoding="utf8"))
    by_name = {}
    for gid, e in gindex.items():  # Glottolog names first, so CLDR names (set second) win on clashes
        if e[6]:
            by_name.setdefault(e[0].lower(), e[6])
    for code, l in languages.items():
        by_name[l["name"].lower()] = code
    known = set(languages) | {e[6] for e in gindex.values() if e[6]}

    def code_for(name):
        n = name.lower().strip()
        return SLUG_ALIASES.get(n) or by_name.get(n) or by_name.get(n.replace("-", " ")) or by_name.get(re.sub(r" language$", "", n))

    out = {}
    entry = lambda code: out.setdefault(code, {"resources": []})
    add = lambda code, **r: entry(code)["resources"].append(r)

    for wcode, h in d["hello"]["by_code"].items():
        code = wcode if wcode in known else alias_to_cldr.get(wcode, wcode)
        if code not in known:
            continue
        entry(code)["hello"] = {k: h[k] for k in ("word", "translit", "ipa", "audio", "audio_file") if h.get(k)}
        entry(code)["hello"]["source"] = f"https://en.wiktionary.org/wiki/{h['title']}#{h['section']}" if h.get("title") else \
            "https://en.wiktionary.org/wiki/hello#Translations"

    for name, courses in d["duolingo"].items():
        code = code_for(name)
        if not code:
            continue
        c = next((x for x in courses if x["from_code"] == "en"), max(courses, key=lambda x: x["learners"]))
        add(code, kind="course", title=f"Duolingo: {name} for {c['from']} speakers", note=f"{c['learners']:,} learners",
            url=f"https://www.duolingo.com/course/{c['code']}/{c['from_code']}/Learn-{name.replace(' ', '-')}")
    for slug, items in d["livelingua"].items():
        for it in items:
            code = code_for(it["variety"]) if it["variety"] and code_for(it["variety"]) else code_for(slug)
            if code:
                label = f"{slug.title()} ({it['variety']})" if it["variety"] else slug.title()
                add(code, kind="course", title=f"Live Lingua Project: {label}", url=it["url"],
                    note="Free Peace Corps, FSI and DLI course books and audio")
    for code, url in d["languagetransfer"].items():
        add(code, kind="course", title="Language Transfer", url=url,
            note="Free audio course" + (" (English for Spanish speakers)" if code == "en" else ""))
    for title in d["wikibooks"]:
        code = code_for(title)
        if code:
            add(code, kind="textbook", title=f"Wikibooks: {title}", url=f"https://en.wikibooks.org/wiki/{title.replace(' ', '_')}",
                note="Free open textbook")
    for code, l in languages.items():
        name = l["name"]
        cat = d["wiktionary"].get(f"Category:{name} language")
        if cat:
            add(code, kind="dictionary", title=f"Wiktionary: {name} words", url=f"https://en.wiktionary.org/wiki/{cat.replace(' ', '_')}",
                note="Free dictionary with pronunciations")
        wp = d["wikipedia"].get(f"{name} language") or d["wikipedia"].get(name)
        if wp and "language" in wp.lower():
            add(code, kind="reference", title=f"Wikipedia: {wp}", url=f"https://en.wikipedia.org/wiki/{wp.replace(' ', '_')}")
        if l.get("glottocode"):
            add(code, kind="reference", title="Glottolog", url=f"https://glottolog.org/resource/languoid/id/{l['glottocode']}",
                note="Classification, dialects and bibliography")
    for e in out.values():
        seen, res = set(), []
        for r in sorted(e["resources"], key=lambda r: (KIND_ORDER[r["kind"]], r["title"])):
            if r["url"] not in seen:
                seen.add(r["url"])
                res.append(r)
        e["resources"] = res
    hello = [e["hello"] for e in out.values() if "hello" in e]
    summary = {"hello": len(hello), "hello_ipa": sum("ipa" in h for h in hello), "hello_audio": sum("audio" in h for h in hello),
               "with_course": sum(any(r["kind"] == "course" for r in e["resources"]) for e in out.values()),
               "wiktionary_hello_rev": d["hello"]["revid"]}
    return {"by_code": dict(sorted(out.items())), "summary": summary}
