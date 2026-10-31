"""Scrape "hello" (word, transliteration, IPA, audio) and free learning resources into data/raw/scrape/.

Every HTTP response is cached under data/raw/scrape/cache/, so re-runs are offline and the build is reproducible.
Sources (all fetched politely with a descriptive User-Agent, one request at a time):
  - Wiktionary "hello" translations + each translated word's entry (IPA, recorded audio on Wikimedia Commons)
  - Duolingo public course list            https://www.duolingo.com/api/1/courses/list
  - Live Lingua Project (free Peace Corps / FSI / DLI course material)  https://www.livelingua.com/project/
  - Language Transfer (free audio courses) https://www.languagetransfer.org/
  - Wikibooks language shelves (free textbooks)
  - Wikipedia / Wiktionary: which "<Name> language" articles and categories exist
Usage: python pipeline/scrape.py [--force]
"""
import hashlib
import html
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "raw" / "scrape"
CACHE = OUT / "cache"
UA = "LanguageToday/0.3 (student course project; open-data atlas of world languages)"
FORCE = "--force" in sys.argv


def get(url, delay=1.0):
    """Cached GET. Waits `delay` seconds between live requests and backs off on 429/5xx; errors are never cached."""
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / (hashlib.sha1(url.encode()).hexdigest()[:16] + ".txt")
    if f.exists() and not FORCE:
        return f.read_text(encoding="utf8")
    for attempt in range(6):
        time.sleep(delay)
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60) as r:
                text = r.read().decode("utf8", "replace")
            f.write_text(text, encoding="utf8")
            return text
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503, 504):
                return json.dumps({"_error": f"HTTP {e.code}"})
            wait = int(e.headers.get("Retry-After") or 0) or 5 * 2 ** attempt
            print(f"  {e.code}, waiting {wait}s")
            time.sleep(wait)
        except Exception as e:
            time.sleep(5 * 2 ** attempt)
            last = str(e)
    return json.dumps({"_error": "gave up after retries"})


def api(host, **params):
    return json.loads(get(f"https://{host}/w/api.php?" + urllib.parse.urlencode({"format": "json", "formatversion": 2, **params})))


def strip(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s))).strip()


# ---------- hello ----------
def hello():
    page = api("en.wiktionary.org", action="parse", page="hello", prop="text|revid")["parse"]
    text = page["text"]
    text = text[text.find('id="Translations"'):]
    first = text.find("NavFrame")  # the first translation table is the greeting sense
    second = text.find("NavFrame", first + 10)
    text = text[first:second if second > 0 else len(text)]
    out = {}
    for m in re.finditer(r'<span class="([A-Za-z-]+)" lang="([a-z]{2,3}(?:-[a-z]{2,3})?)">(.*?)</span>(.{0,1500}?)(?=</li>|<li>|$)', text, re.S):
        script, code, inner, after = m.groups()
        if code in out:
            continue
        link = re.search(r'<a href="/wiki/([^"#]+)#([^"]+)"', inner)
        tr = re.search(rf'<span lang="{re.escape(code)}-Latn" class="tr[^"]*">(.*?)</span>', after, re.S)
        out[code] = {"word": strip(inner), "script": script, "translit": strip(tr.group(1)) if tr else None,
                     "title": urllib.parse.unquote(link.group(1)) if link else None,
                     "section": urllib.parse.unquote(link.group(2)) if link else None}
    print(f"hello: {len(out)} languages from Wiktionary rev {page['revid']}")
    for i, (code, h) in enumerate(out.items()):
        if not h["title"]:
            continue
        entry = api("en.wiktionary.org", action="parse", page=h["title"], prop="text", redirects=1)
        body = entry.get("parse", {}).get("text", "")
        sid = h["section"].replace(" ", "_")
        start = body.find(f'id="{sid}"')
        if start < 0:
            continue
        end = body.find("<h2", start + 10)
        sec = body[start:end if end > 0 else len(body)]
        ipa = re.search(r'<span class="IPA[^"]*">([^<]+)</span>', sec)
        mp3 = re.search(r'<source src="(//upload\.wikimedia\.org/[^"]+?\.mp3)"', sec)
        ogg = re.search(r'<source src="(//upload\.wikimedia\.org/wikipedia/commons/[^"]+?\.(?:ogg|oga|wav|flac|opus))"', sec)
        if ipa:
            h["ipa"] = strip(ipa.group(1))
        if mp3 or ogg:
            src = "https:" + (mp3 or ogg).group(1)
            h["audio"] = src
            h["audio_file"] = urllib.parse.unquote((ogg or mp3).group(1).split("/")[-1])
        if i % 50 == 0:
            print(f"  {i}/{len(out)}")
    return {"revid": page["revid"], "by_code": out}


# ---------- resources ----------
def duolingo():
    courses = json.loads(get("https://www.duolingo.com/api/1/courses/list"))
    out = {}
    for c in courses:
        if isinstance(c, dict) and c.get("phase") == 3:  # phase 3 = released course
            out.setdefault(c["learning_language_name"], []).append(
                {"from": c["from_language_name"], "from_code": c["from_language"], "code": c["learning_language"],
                 "learners": c.get("num_learners", 0)})
    return out


def livelingua():
    page = get("https://www.livelingua.com/project/")
    out = {}
    for url in sorted(set(re.findall(r'href="(https://www\.livelingua\.com/(?:[a-z-]+/)?courses/[a-z-]+(?:/[a-z-]+)?)"', page))):
        parts = url.split("/courses/")
        slug = parts[1].split("/")[0]
        if slug == "general":
            continue
        key = parts[0].rsplit("/", 1)[-1] if parts[0].count("/") > 2 else slug  # /arabic/courses/egyptian -> arabic
        variety = slug if key != slug else (parts[1].split("/")[1] if "/" in parts[1] else None)
        out.setdefault(key, []).append({"url": url, "variety": variety})
    return out


def languagetransfer():
    page = get("https://www.languagetransfer.org/")
    slugs = {"arabic": "ar", "french": "fr", "german": "de", "greek": "el", "italian": "it", "swahili": "sw",
             "turkish": "tr", "complete-spanish": "es", "ingles": "en"}
    return {code: f"https://www.languagetransfer.org/{s}" for s, code in slugs.items() if f'href="/{s}"' in page}


def wikibooks():
    titles = []
    for sub in ("Africa", "Asia", "Europe", "North America", "Oceania", "South America"):
        r = api("en.wikibooks.org", action="query", list="categorymembers", cmtitle=f"Category:Subject:Languages of {sub}",
                cmlimit=500, cmtype="page")
        titles += [m["title"] for m in r.get("query", {}).get("categorymembers", []) if ":" not in m["title"]]
    return sorted(set(titles))


def existing(host, titles):
    """Which of `titles` exist on a wiki (after redirects). Returns {asked title: final title}."""
    found = {}
    titles = list(dict.fromkeys(titles))
    for i in range(0, len(titles), 50):
        chunk = titles[i:i + 50]
        r = api(host, action="query", titles="|".join(chunk), redirects=1)
        q = r.get("query", {})
        redirect = {x["from"]: x["to"] for x in q.get("redirects", []) + q.get("normalized", [])}
        ok = {p["title"] for p in q.get("pages", []) if not p.get("missing") and not p.get("invalid")}
        for t in chunk:
            final = redirect.get(redirect.get(t, t), redirect.get(t, t))
            if final in ok:
                found[t] = final
    return found


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    langs = json.loads((ROOT / "site" / "data" / "languages.json").read_text(encoding="utf8"))
    names = sorted({l["name"] for l in langs.values()})
    result = {
        "hello": hello(),
        "duolingo": duolingo(),
        "livelingua": livelingua(),
        "languagetransfer": languagetransfer(),
        "wikibooks": wikibooks(),
        "wikipedia": existing("en.wikipedia.org", [f"{n} language" for n in names] + names),
        "wiktionary": existing("en.wiktionary.org", [f"Category:{n} language" for n in names]),
    }
    (OUT / "scraped.json").write_text(json.dumps(result, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf8")
    h = result["hello"]["by_code"]
    print(f"hello {len(h)} (ipa {sum('ipa' in x for x in h.values())}, audio {sum('audio' in x for x in h.values())}); "
          f"duolingo {len(result['duolingo'])}; livelingua {len(result['livelingua'])}; languagetransfer {len(result['languagetransfer'])}; "
          f"wikibooks {len(result['wikibooks'])}; wikipedia {len(result['wikipedia'])}; wiktionary {len(result['wiktionary'])}")


if __name__ == "__main__":
    main()
