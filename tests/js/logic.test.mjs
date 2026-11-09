// Unit tests for site/js/logic.js. Run: node --test tests/js
import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../../site/js/logic.js";

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const anchors = { series: [{ country: "XX", lang: "aa", points: [[1980, 10], [2000, 30]] }] };
const idx = L.indexAnchors(anchors);
const pop = (n) => Array.from({ length: 65 }, () => n);
const countries = {
  XX: { pop: pop(1000), langs: [{ code: "aa", pct: 50 }, { code: "bb", pct: 80 }] },
  YY: { pop: pop(500), langs: [{ code: "bb", pct: 100 }, { code: "cc", pct: 20 }] },
};

test("interpolate holds flat outside anchors and is linear inside", () => {
  const pts = [[1980, 10], [2000, 30]];
  assert.equal(L.interpolate(pts, 1960), 10);
  assert.equal(L.interpolate(pts, 1990), 20);
  assert.equal(L.interpolate(pts, 2024), 30);
  assert.equal(L.interpolate([[2000, 5]], 1990), 5);
});

test("popAt clamps to the series", () => {
  const c = { pop: Array.from({ length: 65 }, (_, i) => i) };
  assert.equal(L.popAt(c, 1960), 0);
  assert.equal(L.popAt(c, 1950), 0);
  assert.equal(L.popAt(c, 2024), 64);
  assert.equal(L.popAt(c, 2100), 64);
});

test("shareAt tags provenance: measured on anchor years, estimated between, derived without anchors", () => {
  assert.equal(L.shareAt("XX", "aa", 50, 1980, idx).provenance, "measured");
  const mid = L.shareAt("XX", "aa", 50, 1990, idx);
  assert.equal(mid.provenance, "estimated");
  assert.equal(mid.pct, 20);
  const plain = L.shareAt("XX", "bb", 80, 1990, idx);
  assert.deepEqual([plain.pct, plain.provenance], [80, "derived"]);
});

test("breakdown sorts by share and computes speakers", () => {
  const b = L.breakdown("XX", countries.XX, 1990, idx);
  assert.deepEqual(b.map((l) => l.code), ["bb", "aa"]);
  assert.equal(b[0].speakers, 800);
  assert.equal(b[1].speakers, 200);
});

test("multilingualIndex sums shares", () => {
  close(L.multilingualIndex([{ pct: 100 }, { pct: 35 }]), 1.35);
  assert.equal(L.multilingualIndex([]), 0);
});

test("reachability: single language equals its share", () => {
  const r = L.reachability([{ code: "aa", pct: 50 }], [{ code: "aa", level: "native" }]);
  close(r.estimate, 0.5);
  assert.equal(r.best, "aa");
});

test("reachability: two languages combine under independence with bounds", () => {
  const r = L.reachability([{ code: "aa", pct: 50 }, { code: "bb", pct: 50 }],
    [{ code: "aa", level: "fluent" }, { code: "bb", level: "fluent" }]);
  close(r.estimate, 0.75);
  close(r.low, 0.5);
  close(r.high, 1);
});

test("reachability: level weights and unknown languages", () => {
  const r = L.reachability([{ code: "aa", pct: 100 }], [{ code: "aa", level: "basic" }, { code: "zz", level: "native" }]);
  close(r.estimate, 0.4);
  assert.equal(L.reachability([], [{ code: "aa", level: "native" }]).estimate, 0);
});

test("reachability: estimate always within [low, high]", () => {
  const langs = [{ code: "a", pct: 70 }, { code: "b", pct: 40 }, { code: "c", pct: 90 }];
  const mine = [{ code: "a", level: "conversational" }, { code: "b", level: "basic" }, { code: "c", level: "native" }];
  const r = L.reachability(langs, mine);
  assert.ok(r.low <= r.estimate + 1e-12 && r.estimate <= r.high + 1e-12);
});

test("reachability: lists your languages that have no figure in the country", () => {
  const r = L.reachability([{ code: "aa", pct: 40 }], [{ code: "aa", level: "fluent" }, { code: "zz", level: "fluent" }]);
  assert.deepEqual(r.missing, ["zz"]);
  close(r.estimate, 0.4);
  assert.deepEqual(L.reachability([{ code: "aa", pct: 40 }], [{ code: "aa", level: "fluent" }]).missing, []);
});

test("formatPct never prints a non-zero share as 0%", () => {
  assert.equal(L.formatPct(0.004), "<0.01%");
  assert.equal(L.formatPct(0.7), "0.70%");
  assert.equal(L.formatPct(3.75), "3.8%");
  assert.equal(L.formatPct(28), "28%");
  assert.equal(L.formatPct(0), "0%");
  assert.equal(L.formatPct(null), "–");
});

test("searchByName ranks prefix matches before substring matches", () => {
  const items = [{ name: "Swiss German" }, { name: "German" }, { name: "Low German" }, { name: "French" }];
  assert.deepEqual(L.searchByName(items, "germ").map((i) => i.name), ["German", "Swiss German", "Low German"]);
  assert.deepEqual(L.searchByName(items, "  "), []);
  assert.equal(L.searchByName(items, "e", 2).length, 2);
});

test("languageTotal sums speakers across countries and ranks them", () => {
  const t = L.languageTotal(countries, "bb", 2024, idx);
  assert.equal(t.speakers, 1300);
  assert.deepEqual(t.where.map((w) => w.iso2), ["XX", "YY"]);
});

test("topLanguages ranks by speakers and respects anchors", () => {
  const top = L.topLanguages(countries, 2024, idx, 3);
  assert.deepEqual(top.map((t) => t.code), ["bb", "aa", "cc"]);
  assert.equal(top[1].speakers, 300); // anchored aa = 30% in 2024
});

test("regionSummary: second languages exclude each country's main language", () => {
  const s = L.regionSummary(Object.entries(countries), 2024, idx);
  assert.equal(s.pop, 1500);
  assert.deepEqual(s.second.map((d) => d.code).sort(), ["aa", "cc"]);
  close(s.index, (800 + 300 + 500 + 100) / 1500);
});

test("livingLanguagesAt counts extinct languages only up to their last documentation", () => {
  const rows = [["A", "f", null, null], ["B", "f", "extinct", 1980], ["C", "f", "extinct", null], ["D", "f", "moribund", null]];
  assert.equal(L.livingLanguagesAt(rows, 1970), 3);
  assert.equal(L.livingLanguagesAt(rows, 1980), 3);
  assert.equal(L.livingLanguagesAt(rows, 1981), 2);
});

test("formatCount", () => {
  assert.equal(L.formatCount(1.734e9), "1.73 B");
  assert.equal(L.formatCount(276e6), "276 M");
  assert.equal(L.formatCount(16.04e6), "16.0 M");
  assert.equal(L.formatCount(950), "950");
});

const calls = [
  { p: 0, step: "a", in: 1, out: 10, cw: 100, cr: 1000, ctx: 1101 },
  { p: 0, step: "b", in: 0, out: 20, cw: 50, cr: 2000, ctx: 2050 },
  { p: 1, step: "a", in: 2, out: 5, cw: 10, cr: 3000, ctx: 3012 },
];

test("tokenTotals sums every field and keeps the peak context", () => {
  const t = L.tokenTotals(calls);
  assert.deepEqual([t.calls, t.in, t.out, t.cw, t.cr, t.peak_ctx], [3, 3, 35, 160, 6000, 3012]);
  assert.equal(t.processed, 3 + 35 + 160 + 6000);
  assert.equal(L.tokenTotals([]).peak_ctx, 0);
});

test("groupTokens groups in first-seen order and the groups add up to the total", () => {
  const g = L.groupTokens(calls, "step");
  assert.deepEqual(g.map((x) => [x.key, x.calls, x.out]), [["a", 2, 15], ["b", 1, 20]]);
  assert.equal(g.reduce((s, x) => s + x.cr, 0), L.tokenTotals(calls).cr);
  assert.deepEqual(L.groupTokens(calls, "p").map((x) => x.key), [0, 1]);
});

test("share handles an empty whole", () => {
  assert.equal(L.share(1, 4), 25);
  assert.equal(L.share(1, 0), 0);
});

test("matchesQuery needs every word in some field", () => {
  const row = { title: "Fix reach 0%", detail: "Wikipedia L2 tables" };
  assert.ok(L.matchesQuery(row, "", ["title"]));
  assert.ok(L.matchesQuery(row, "reach wikipedia", ["title", "detail"]));
  assert.ok(!L.matchesQuery(row, "reach wikipedia", ["title"]));
  assert.ok(L.matchesQuery({ title: null }, "  ", ["title"]));
});

test("countBy keeps first-seen order", () => {
  assert.deepEqual(L.countBy(["b", "a", "b"], (x) => x), [["b", 2], ["a", 1]]);
});

test("dayOf uses the timestamp's own offset", () => {
  assert.equal(L.dayOf("2026-10-30T23:33:34-07:00"), "2026-10-30");
});
