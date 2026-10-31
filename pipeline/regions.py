"""Sub-national regions (Natural Earth admin-1) with the languages located in each.

For every region: simplified outline, the Glottolog languages whose recorded location falls inside it, and any
curated or Wikipedia regional share. Output is split per country so the app loads only what it shows.
"""
import json
import math
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
CURATED = Path(__file__).resolve().parent / "regional_shares.json"
TOLERANCE = 0.02  # degrees, Douglas-Peucker
# Names used by the share sources for units that Natural Earth names differently.
ALIASES = {"flanders": "flemish", "wallonia": "walloon", "south tyrol": "bolzano", "aland": "aland islands",
           "navarra": "foral de navarra", "riga region": "riga"}


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"\b(county|province|region|state|oblast|autonomous community|comunidad autonoma de)\b", "", s).replace("-", " ").strip()


def simplify(ring, tol=TOLERANCE):
    if len(ring) < 5:
        return ring
    keep = [False] * len(ring)
    keep[0] = keep[-1] = True
    stack = [(0, len(ring) - 1)]
    while stack:
        a, b = stack.pop()
        (x1, y1), (x2, y2) = ring[a], ring[b]
        dx, dy = x2 - x1, y2 - y1
        length = math.hypot(dx, dy) or 1e-12
        best, idx = 0.0, None
        for i in range(a + 1, b):
            x, y = ring[i]
            d = abs(dy * x - dx * y + x2 * y1 - y2 * x1) / length if (dx or dy) else math.hypot(x - x1, y - y1)
            if d > best:
                best, idx = d, i
        if idx is not None and best > tol:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(ring, keep) if k]


def area(ring):
    return sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(ring, ring[1:])) / 2


def polygons(geom):
    return [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]


def point_in(poly, x, y):
    inside = False
    for ring in poly:  # even-odd over outer ring and holes
        j = len(ring) - 1
        for i in range(len(ring)):
            xi, yi = ring[i]
            xj, yj = ring[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi:
                inside = not inside
            j = i
    return inside


def build(gindex, wiki_territories, dialects):
    gj = json.loads((RAW / "ne_10m_admin1.geojson").read_text(encoding="utf8"))
    curated = json.loads(CURATED.read_text(encoding="utf8"))["series"]
    pts = [(gid, e[3], e[2]) for gid, e in gindex.items() if e[2] is not None]
    dpts = [(f"{d[0]}|{gid}", d[2], d[1]) for gid, ds in dialects.items() for d in ds if d[1] is not None]
    out, lookup = {}, {}
    for f in gj["features"]:
        p, geom = f["properties"], f["geometry"]
        iso2 = p.get("iso_a2")
        if not geom or not iso2 or iso2 == "-1":
            continue
        polys = polygons(geom)
        xs = [c[0] for poly in polys for c in poly[0]]
        ys = [c[1] for poly in polys for c in poly[0]]
        bbox = (min(xs), min(ys), max(xs), max(ys))
        here = sorted(gid for gid, x, y in pts
                      if bbox[0] <= x <= bbox[2] and bbox[1] <= y <= bbox[3] and any(point_in(poly, x, y) for poly in polys))
        here_d = sorted(key for key, x, y in dpts
                        if bbox[0] <= x <= bbox[2] and bbox[1] <= y <= bbox[3] and any(point_in(poly, x, y) for poly in polys))
        simple = []
        for poly in polys:
            rings = [[[round(x, 3), round(y, 3)] for x, y in simplify(r)] for r in poly]
            # d3-geo wants exterior rings clockwise and holes counter-clockwise (planar signed area < 0 / > 0)
            rings = [r if (area(r) < 0) == (i == 0) else r[::-1] for i, r in enumerate(rings)]
            if len(rings[0]) >= 4:
                simple.append([r for r in rings if len(r) >= 4])
        if not simple:
            continue
        rid = p.get("adm1_code") or f"{iso2}-{p.get('name')}"
        parent = p.get("region") or None
        unit = p.get("geonunit") if p.get("geonunit") not in (None, p.get("admin")) else None
        rec = {"id": rid, "name": p.get("name_en") or p.get("name"), "local": p.get("name"), "type": p.get("type_en"),
               "parent": parent, "unit": unit, "langs": here, "dialects": [k.split("|") for k in here_d], "shares": [], "geom": simple}
        out.setdefault(iso2, []).append(rec)
        for key in {p.get("name"), p.get("name_en"), *(p.get("name_alt") or "").split("|"), parent, unit}:
            if key:
                lookup.setdefault((iso2, norm(key)), []).append(rec)
    def find(iso2, name):
        n = norm(name)
        return lookup.get((iso2, n)) or lookup.get((iso2, ALIASES.get(n, n)))

    unmatched = []
    for s in curated:  # a share for a parent region (e.g. Cataluna) applies to each of its admin-1 units
        recs = find(s["country"], s["region"])
        for rec in recs or []:
            rec["shares"].append({"region": s["region"], **{k: s[k] for k in ("lang", "pct", "year", "metric", "source", "confidence")}})
        if not recs:
            unmatched.append(f"{s['country']}/{s['region']}")
    for t in wiki_territories:
        recs = find(t["country"], t["territory"])
        for rec in recs or []:
            if not any(x["lang"] == t["lang"] for x in rec["shares"]):
                rec["shares"].append({"region": t["territory"], "lang": t["lang"], "pct": t["pct"], "year": t.get("year"),
                                      "metric": "speakers (Wikipedia table)", "source": f"English Wikipedia, {t['title']} rev {t['revid']}",
                                      "confidence": "medium"})
        if not recs:
            unmatched.append(f"{t['country']}/{t['territory']} (wikipedia {t['lang']})")
    for recs in out.values():
        recs.sort(key=lambda r: r["id"])
    return dict(sorted(out.items())), unmatched
