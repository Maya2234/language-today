// Pure functions behind the atlas. No DOM access, so they run in the browser and under `node --test`.

export const YEAR0 = 1960;

// Weight of each self-reported level when estimating whether a conversation is possible.
export const LEVEL_WEIGHT = { native: 1, fluent: 1, conversational: 0.75, basic: 0.4 };

export function interpolate(points, year) {
  if (year <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (year >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    const [y0, v0] = points[i - 1], [y1, v1] = points[i];
    if (year <= y1) return v0 + ((v1 - v0) * (year - y0)) / (y1 - y0);
  }
}

export function indexAnchors(anchors) {
  const map = new Map();
  for (const s of anchors.series) map.set(`${s.country}|${s.lang}`, s);
  return map;
}

export function popAt(country, year) {
  const i = Math.max(0, Math.min(country.pop.length - 1, year - YEAR0));
  return country.pop[i];
}

// Share (0-100) of a country's population speaking `lang` in `year`, with provenance.
export function shareAt(iso2, lang, pct, year, anchorIdx) {
  const s = anchorIdx?.get(`${iso2}|${lang}`);
  if (!s) return { pct, provenance: "derived" };
  const pts = s.points;
  const exact = pts.some(([y]) => y === year);
  return { pct: interpolate(pts, year), provenance: exact ? "measured" : "estimated", series: s };
}

export function breakdown(iso2, country, year, anchorIdx) {
  const pop = popAt(country, year);
  return country.langs
    .map((l) => {
      const s = shareAt(iso2, l.code, l.pct, year, anchorIdx);
      return { code: l.code, official: l.official, pct: s.pct, provenance: s.provenance, series: s.series,
               speakers: (pop * s.pct) / 100 };
    })
    .sort((a, b) => b.pct - a.pct);
}

// Average languages per person (upper bound: CLDR shares count L1 and L2 speakers).
export function multilingualIndex(langs) {
  return langs.reduce((t, l) => t + l.pct, 0) / 100;
}

// Chance that a random resident shares at least one language with the user.
// estimate assumes independence; low = best single language; high = no overlap between speaker groups.
// missing = the user's languages with no figure for this country: the estimate is then a lower bound.
export function reachability(langs, mine) {
  const byCode = new Map(langs.map((l) => [l.code, l.pct / 100]));
  let none = 1, low = 0, high = 0, best = null;
  const missing = mine.filter((m) => !byCode.has(m.code)).map((m) => m.code);
  for (const m of mine) {
    const p = Math.min(1, (byCode.get(m.code) || 0) * (LEVEL_WEIGHT[m.level] ?? 1));
    none *= 1 - p;
    high += p;
    if (p > low) { low = p; best = m.code; }
  }
  return { estimate: 1 - none, low, high: Math.min(1, high), best, missing };
}

export function languageTotal(countries, code, year, anchorIdx) {
  let speakers = 0;
  const where = [];
  for (const [iso2, c] of Object.entries(countries)) {
    const l = c.langs.find((x) => x.code === code);
    if (!l) continue;
    const s = shareAt(iso2, code, l.pct, year, anchorIdx);
    const n = (popAt(c, year) * s.pct) / 100;
    speakers += n;
    where.push({ iso2, speakers: n, pct: s.pct });
  }
  where.sort((a, b) => b.speakers - a.speakers);
  return { speakers, where };
}

export function topLanguages(countries, year, anchorIdx, n = 15) {
  const totals = new Map();
  for (const [iso2, c] of Object.entries(countries)) {
    const pop = popAt(c, year);
    for (const l of c.langs) {
      const s = shareAt(iso2, l.code, l.pct, year, anchorIdx);
      totals.set(l.code, (totals.get(l.code) || 0) + (pop * s.pct) / 100);
    }
  }
  return [...totals].map(([code, speakers]) => ({ code, speakers }))
    .sort((a, b) => b.speakers - a.speakers).slice(0, n);
}

// Aggregate a set of countries (a region): population-weighted multilingual index and
// the most widespread languages that are NOT each country's first language (second languages).
export function regionSummary(entries, year, anchorIdx) {
  let pop = 0, langPeople = 0;
  const second = new Map(), all = new Map();
  for (const [iso2, c] of entries) {
    const p = popAt(c, year);
    const b = breakdown(iso2, c, year, anchorIdx);
    pop += p;
    b.forEach((l, i) => {
      langPeople += l.speakers;
      all.set(l.code, (all.get(l.code) || 0) + l.speakers);
      if (i > 0) second.set(l.code, (second.get(l.code) || 0) + l.speakers);
    });
  }
  const rank = (m) => [...m].map(([code, speakers]) => ({ code, speakers })).sort((a, b) => b.speakers - a.speakers);
  return { pop, index: pop ? langPeople / pop : 0, top: rank(all).slice(0, 8), second: rank(second).slice(0, 8) };
}

// Glottolog rows: [name, family, aes, lastDocumented]. A language counts as living in `year`
// unless it is extinct and was last documented before that year (extinct with no date: never counted).
export function livingLanguagesAt(rows, year) {
  let n = 0;
  for (const [, , aes, last] of rows) {
    if (aes !== "extinct") n++;
    else if (last != null && last >= year) n++;
  }
  return n;
}

// Percent for display: never prints a non-zero share as "0%".
export function formatPct(p) {
  if (p == null) return "–";
  if (p === 0) return "0%";
  if (p < 0.01) return "<0.01%";
  if (p < 1) return p.toFixed(2) + "%";
  return (p >= 10 ? p.toFixed(0) : p.toFixed(1)) + "%";
}

// Search a list of {name} items: names starting with the query first, then names containing it.
export function searchByName(items, query, limit = 40) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts = [], contains = [];
  for (const it of items) {
    const n = it.name.toLowerCase();
    if (n.startsWith(q)) starts.push(it);
    else if (n.includes(q)) contains.push(it);
    if (starts.length >= limit) break;
  }
  return starts.concat(contains).slice(0, limit);
}

export function formatCount(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + " B";
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e8 ? 0 : 1) + " M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + " k";
  return String(Math.round(n));
}

// ---- token dashboard ----
export const TOKEN_METRICS = ["in", "out", "cw", "cr"];

// Sum token fields over model calls; ctx_total = everything the model processed (input + cache write + cache read).
export function tokenTotals(calls) {
  const t = { calls: calls.length, in: 0, out: 0, cw: 0, cr: 0, peak_ctx: 0 };
  for (const c of calls) {
    for (const k of TOKEN_METRICS) t[k] += c[k];
    t.peak_ctx = Math.max(t.peak_ctx, c.ctx);
  }
  t.processed = t.in + t.cw + t.cr + t.out;
  return t;
}

// Group calls by a key (e.g. "step" or "p") into [{key, ...tokenTotals}], keeping first-seen order.
export function groupTokens(calls, key) {
  const groups = new Map();
  for (const c of calls) {
    if (!groups.has(c[key])) groups.set(c[key], []);
    groups.get(c[key]).push(c);
  }
  return [...groups].map(([k, cs]) => ({ key: k, ...tokenTotals(cs) }));
}

// Share of a part in a whole as a percent, 0 when the whole is empty.
export function share(part, whole) {
  return whole ? (100 * part) / whole : 0;
}
