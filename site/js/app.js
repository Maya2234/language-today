import * as L from "./logic.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const pctf = (p) => p > 0 && p < 0.01 ? "<0.01%" : (p >= 10 ? p.toFixed(0) : p >= 1 ? p.toFixed(1) : p.toFixed(2)) + "%";
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

const state = { mode: "languages", proj: "globe", year: 2024, lang: null, selected: null, mine: store.get("lt.mine", []) };

const load = (f) => fetch(`data/${f}`).then((r) => r.json());
const [world, countries, languages, anchors, meta] = await Promise.all(
  ["countries-110m.json", "countries.json", "languages.json", "anchors.json", "meta.json"].map(load));
let glottolog = null;
const glot = async () => (glottolog ??= await load("glottolog_by_country.json"));

const anchorIdx = L.indexAnchors(anchors);
const lname = (code) => languages[code]?.name ?? code;
const byNumeric = new Map(Object.entries(countries).map(([iso2, c]) => [c.numeric, iso2]));
const features = topojson.feature(world, world.objects.countries).features;
for (const f of features) f.iso2 = byNumeric.get(String(f.id));
const REGIONS = ["Africa", "Americas", "Asia", "Europe", "Oceania"];
const bigCountries = () => Object.entries(countries).filter(([, c]) => L.popAt(c, state.year) >= 1e6);

// Language picker options, most spoken first.
$("#langList").innerHTML = Object.entries(languages)
  .filter(([, l]) => l.speakers > 0).sort((a, b) => b[1].speakers - a[1].speakers)
  .map(([code, l]) => `<option value="${esc(l.name)}" label="${esc(code)}">`).join("");
const codeFromName = (name) => {
  const n = name.trim().toLowerCase();
  return Object.keys(languages).find((c) => languages[c].name.toLowerCase() === n || c === n) ?? null;
};

// ---------- map ----------
const svg = d3.select("#map");
const gRoot = svg.append("g");
const sphere = gRoot.append("path").attr("class", "sphere").datum({ type: "Sphere" });
const grat = gRoot.append("path").attr("class", "graticule").datum(d3.geoGraticule10());
const paths = gRoot.selectAll("path.country").data(features).join("path").attr("class", "country")
  .attr("vector-effect", "non-scaling-stroke");
let projection, path, baseScale, rot = [-10, -20], last = d3.zoomIdentity, resetting = false;

function setupProjection() {
  const { width: w, height: h } = svg.node().getBoundingClientRect();
  projection = state.proj === "globe"
    ? d3.geoOrthographic().rotate(rot).clipAngle(90)
    : d3.geoEqualEarth();
  projection.fitExtent([[12, 56], [w - 12, h - 12]], { type: "Sphere" });
  baseScale = projection.scale();
  path = d3.geoPath(projection);
  resetting = true;
  svg.call(zoom.transform, d3.zoomIdentity);
  resetting = false;
  last = d3.zoomIdentity;
  gRoot.attr("transform", null);
  drawGeometry();
}
function drawGeometry() {
  sphere.attr("d", path);
  grat.attr("d", path);
  paths.attr("d", path);
}
const zoom = d3.zoom().scaleExtent([0.8, 10]).clickDistance(4).on("zoom", (e) => {
  if (resetting) return;
  const t = e.transform;
  if (state.proj === "flat") gRoot.attr("transform", t);
  else {
    if (e.sourceEvent && e.sourceEvent.type !== "wheel") {
      rot = [rot[0] + ((t.x - last.x) * 0.3) / t.k, Math.max(-75, Math.min(75, rot[1] - ((t.y - last.y) * 0.3) / t.k))];
      projection.rotate(rot);
    }
    projection.scale(baseScale * t.k);
    drawGeometry();
  }
  last = t;
});
svg.call(zoom);
new ResizeObserver(() => setupProjection()).observe(svg.node());

// ---------- colour layers ----------
const DOM_PALETTE = ["#1f6f8b", "#d1495b", "#edae49", "#66a182", "#8d6cab", "#e07a5f", "#3d405b", "#2a9d8f", "#b5838d", "#6b705c", "#c9a227", "#4f8fc0"];
// Regional Arabic varieties that CLDR lists separately are coloured as Arabic in the "most spoken" layer.
const ARABIC = new Set(["arz", "ary", "arq", "aeb", "apc", "ars", "acm", "shu", "ajp", "afb", "ayl", "ayh", "acq", "apd", "ssh"]);
const dominantAt = (iso2) => {
  const top = L.breakdown(iso2, countries[iso2], state.year, anchorIdx)[0];
  return top && (ARABIC.has(top.code) ? { ...top, code: "ar" } : top);
};
const domColors = (() => {  // palette goes to the languages dominant over the most people
  const pop = d3.rollup(Object.keys(countries).filter((k) => dominantAt(k)), (v) => d3.sum(v, (k) => L.popAt(countries[k], state.year)), (k) => dominantAt(k).code);
  const top = [...pop].sort((a, b) => b[1] - a[1]).slice(0, DOM_PALETTE.length).map((d) => d[0]);
  return new Map(top.map((c, i) => [c, DOM_PALETTE[i]]));
})();
const otherColor = (code) => {  // stable muted tone per language so neighbouring "other" countries stay distinct
  let h = 0;
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const dark = matchMedia("(prefers-color-scheme: dark)").matches && document.documentElement.dataset.theme !== "light";
  return d3.hsl(h, 0.22, dark ? 0.38 : 0.74).formatHex();
};
const seq = (domain, kind = "linear") => {
  const s = kind === "log" ? d3.scaleSequentialLog() : kind === "sqrt" ? d3.scaleSequentialSqrt() : d3.scaleSequential();
  return s.domain(domain).interpolator(d3.interpolateLab(css("--seq-lo"), css("--seq-hi"))).clamp(true);
};

function layer() {
  const y = state.year, out = new Map();
  for (const [iso2, c] of Object.entries(countries)) {
    const b = L.breakdown(iso2, c, y, anchorIdx);
    if (state.mode === "languages" && !state.lang) out.set(iso2, dominantAt(iso2)?.code);
    else if (state.mode === "languages") out.set(iso2, b.find((l) => l.code === state.lang)?.pct ?? 0);
    else if (state.mode === "multilingual") out.set(iso2, b.length ? L.multilingualIndex(b) : null);
    else if (state.mode === "reach") out.set(iso2, state.mine.length ? L.reachability(b, state.mine).estimate : null);
  }
  if (state.mode === "diversity" && glottolog)
    for (const iso2 of Object.keys(countries)) out.set(iso2, L.livingLanguagesAt(glottolog[iso2] ?? [], y) || null);
  return out;
}

function scaleForMode() {
  if (state.mode === "languages" && !state.lang) return (code) => domColors.get(code) ?? otherColor(code);
  if (state.mode === "languages") return seq([0, 100], "sqrt");
  if (state.mode === "multilingual") return seq([1, 3]);
  if (state.mode === "diversity") return seq([1, 800], "log");
  return seq([0, 1]);
}

function describe(iso2, v) {
  if (v == null) return "no data";
  if (state.mode === "languages" && !state.lang) return `Most spoken: ${lname(v)}`;
  if (state.mode === "languages") return `${lname(state.lang)}: ${pctf(v)} of people`;
  if (state.mode === "multilingual") return `${v.toFixed(2)} languages per person`;
  if (state.mode === "diversity") return `${v} languages (Glottolog)`;
  return `~${Math.round(v * 100)}% could talk with you`;
}

let current = new Map();
function recolor() {
  current = layer();
  const sc = scaleForMode();
  paths.attr("fill", (f) => {
    const v = current.get(f.iso2);
    return v == null || (typeof v === "number" && v <= 0 && state.mode !== "reach") ? css("--land-empty") : sc(v);
  }).classed("selected", (f) => f.iso2 && f.iso2 === state.selected);
  renderLegend(sc);
}

function renderLegend(sc) {
  const el = $("#legend");
  if (state.mode === "languages" && !state.lang) {
    el.innerHTML = `<b>Most spoken language, ${state.year}</b><div class="cats">${[...domColors]
      .map(([c, col]) => `<span><i class="sw" style="background:${col}"></i>${esc(c === "ar" ? "Arabic (incl. varieties)" : lname(c))}</span>`).join("")}
      <span><i class="sw" style="background:${css("--other")}"></i>Other (muted tones; hover for name)</span></div>`;
    return;
  }
  const [title, ticks] = {
    languages: [`Share speaking ${lname(state.lang)}`, ["0%", "25%", "100%"]],
    multilingual: ["Languages per person (L1+L2)", ["1", "2", "3+"]],
    diversity: ["Living languages (Glottolog)", ["1", "30", "800"]],
    reach: ["Chance a random resident shares a language with you", ["0%", "50%", "100%"]],
  }[state.mode];
  const stops = d3.range(0, 1.01, 0.1).map((t) => sc.interpolator()(t)).join(",");
  el.innerHTML = `<b>${esc(title)}</b><div class="ramp" style="background:linear-gradient(90deg,${stops})"></div>
    <div class="ticks">${ticks.map((t) => `<span>${t}</span>`).join("")}</div>`;
}

const tip = $("#tooltip");
paths.on("pointermove", (e, f) => {
  const c = countries[f.iso2];
  if (!c) return;
  const [x, y] = d3.pointer(e, $(".mapwrap"));
  tip.hidden = false;
  tip.innerHTML = `<b>${esc(c.name)}</b><br>${esc(describe(f.iso2, current.get(f.iso2)))}`;
  tip.style.left = Math.min(x + 14, $(".mapwrap").clientWidth - 250) + "px";
  tip.style.top = y + 14 + "px";
}).on("pointerleave", () => (tip.hidden = true))
  .on("click", (e, f) => { if (countries[f.iso2]) select(f.iso2); });

// ---------- small charts ----------
function trendChart(series, { anchorsPts = [], fmt = (v) => v, yMax } = {}) {
  const w = 360, h = 120, m = { t: 8, r: 8, b: 18, l: 40 };
  const x = d3.scaleLinear([L.YEAR0, meta.years[1]], [m.l, w - m.r]);
  const y = d3.scaleLinear([0, yMax ?? (d3.max(series, (d) => d[1]) * 1.1 || 1)], [h - m.b, m.t]).nice();
  const s = d3.create("svg").attr("class", "trend").attr("viewBox", `0 0 ${w} ${h}`);
  s.append("g").attr("class", "axis").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(5).tickFormat(d3.format("d")));
  s.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(fmt));
  s.append("path").attr("class", "line").attr("d", d3.line().x((d) => x(d[0])).y((d) => y(d[1]))(series));
  s.selectAll("circle").data(anchorsPts.filter(([yr]) => yr >= L.YEAR0)).join("circle")
    .attr("cx", (d) => x(d[0])).attr("cy", (d) => y(d[1])).attr("r", 3);
  s.append("line").attr("x1", x(state.year)).attr("x2", x(state.year)).attr("y1", m.t).attr("y2", h - m.b)
    .attr("stroke", css("--hover")).attr("stroke-dasharray", "3 2");
  return s.node().outerHTML;
}
const years = () => d3.range(L.YEAR0, meta.years[1] + 1);

const bars = (items, max, { name, val, click }) => `<ul class="rows">${items.map((d) => `
  <li class="row"><span class="name">${click ? `<button data-lang="${esc(click(d))}">${name(d)}</button>` : name(d)}</span>
  <span class="val">${val(d)}</span><span class="bar"><i style="width:${Math.max(0.5, (100 * d.v) / max)}%"></i></span></li>`).join("")}</ul>`;
const tag = (p) => `<span class="tag ${p}" title="${{ measured: "census value for this year", estimated: "interpolated between census anchors", derived: "CLDR share × population" }[p]}">${p}</span>`;

// ---------- panel ----------
async function renderPanel() {
  const el = $("#panel");
  if (state.selected) el.innerHTML = await countryPanel(state.selected);
  else el.innerHTML = await overviewPanel();
  el.querySelectorAll("[data-lang]").forEach((b) => b.addEventListener("click", () => setLang(b.dataset.lang)));
  el.querySelectorAll("[data-country]").forEach((b) => b.addEventListener("click", () => select(b.dataset.country)));
  el.querySelector(".back")?.addEventListener("click", () => select(null));
  const filter = el.querySelector(".gl-filter");
  filter?.addEventListener("input", () => {
    const q = filter.value.toLowerCase();
    el.querySelectorAll(".gl-table tbody tr").forEach((tr) => (tr.hidden = !tr.textContent.toLowerCase().includes(q)));
  });
}

async function countryPanel(iso2) {
  const c = countries[iso2], y = state.year;
  const b = L.breakdown(iso2, c, y, anchorIdx);
  const gl = (await glot())[iso2] ?? [];
  const living = L.livingLanguagesAt(gl, y);
  const lost = gl.filter((g) => g[2] === "extinct" && g[3] >= L.YEAR0).sort((a, b) => b[3] - a[3]);
  const region = c.region ? L.regionSummary(Object.entries(countries).filter(([, x]) => x.subregion === c.subregion), y, anchorIdx) : null;
  let html = `<button class="linkbtn back">← World overview</button>
    <h2>${esc(c.name)}</h2><p class="sub">${esc(c.subregion ?? "")}${c.region ? " · " + esc(c.region) : ""}</p>
    <div class="stats">
      <div class="stat"><b>${L.formatCount(L.popAt(c, y))}</b><span>people in ${y}${c.pop_source === "cldr" ? " (CLDR, flat)" : ""}</span></div>
      <div class="stat"><b>${b.length ? L.multilingualIndex(b).toFixed(2) : "–"}</b><span>languages per person</span></div>
      <div class="stat"><b>${living}</b><span>living languages in ${y}</span></div>
      <div class="stat"><b>${c.glottolog.endangered}</b><span>endangered today</span></div>
      ${c.literacy != null ? `<div class="stat"><b>${c.literacy.toFixed(0)}%</b><span>literacy</span></div>` : ""}
    </div>`;
  if (state.mine.length) {
    const r = L.reachability(b, state.mine);
    html += `<h3>Could you talk here?</h3><p><b>~${Math.round(r.estimate * 100)}%</b> of people likely share a language with you
      (range ${Math.round(r.low * 100)}–${Math.round(r.high * 100)}%). Best bet: <b>${esc(r.best ? lname(r.best) : "none")}</b>.</p>`;
  }
  html += `<h3>Languages spoken, ${y}</h3>`;
  const langOpts = {
    name: (l) => `${esc(lname(l.code))}${l.official ? `<span class="tag official">${esc(l.official.replace(/_/g, " "))}</span>` : ""}${tag(l.provenance)}`,
    val: (l) => `${pctf(l.pct)} · ${L.formatCount(l.speakers)}`, click: (l) => l.code,
  };
  const lv = b.map((l) => ({ ...l, v: l.pct }));
  html += !b.length ? `<p class="note">No language data in CLDR.</p>` : bars(lv.slice(0, 12), 100, langOpts) +
    (lv.length > 12 ? `<details><summary>${lv.length - 12} more languages</summary>${bars(lv.slice(12), 100, langOpts)}</details>` : "");
  html += `<p class="note">Shares count first- and second-language speakers, so they can add up to more than 100%.</p>`;
  for (const l of b.filter((l) => l.series)) {
    const s = l.series;
    html += `<h3>${esc(lname(l.code))} over time</h3>
      ${trendChart(years().map((yr) => [yr, L.interpolate(s.points, yr)]), { anchorsPts: s.points, fmt: (v) => v + "%" })}
      <p class="note">Metric: ${esc(s.metric)}. Source: ${esc(s.source)}. Confidence: ${esc(s.confidence)}. Dots are census values; the line between them is interpolated.</p>`;
  }
  if (region) {
    html += `<h3>${esc(c.subregion)}: second languages</h3>
      <p class="note">${region.index.toFixed(2)} languages per person across the subregion. Most spoken languages that are not a country's main language:</p>
      ${bars(region.second.map((d) => ({ ...d, v: d.speakers })), region.second[0]?.speakers || 1, { name: (d) => esc(lname(d.code)), val: (d) => L.formatCount(d.speakers), click: (d) => d.code })}`;
  }
  if (lost.length) html += `<h3>Languages lost since 1960</h3><p class="note">${lost.map((g) => `${esc(g[0])} (last documented ${g[3]})`).join(", ")}</p>`;
  if (gl.length) html += `<h3>All languages recorded here (Glottolog)</h3><details><summary>Show ${gl.length} languages</summary>
    <input class="gl-filter" type="search" placeholder="Filter by name, family or status">
    <table class="t gl-table"><thead><tr><th>Language</th><th>Family</th><th>Status</th></tr></thead><tbody>
    ${gl.map((g) => `<tr><td>${esc(g[0])}</td><td>${esc(g[1])}</td><td>${esc((g[2] ?? "–").replace(/_/g, " "))}</td></tr>`).join("")}
    </tbody></table></details>`;
  return html;
}

async function overviewPanel() {
  const y = state.year;
  if (state.mode === "languages" && state.lang) return languagePanel(state.lang);
  if (state.mode === "languages") {
    const top = L.topLanguages(countries, y, anchorIdx, 20);
    return `<h2>Most spoken languages, ${y}</h2><p class="sub">First + second-language speakers. Click a language to map it, or click a country.</p>
      <h3>Top 20 worldwide</h3>${bars(top.map((d) => ({ ...d, v: d.speakers })), top[0].speakers, { name: (d) => esc(lname(d.code)), val: (d) => L.formatCount(d.speakers), click: (d) => d.code })}
      <p class="note">Speakers = population × CLDR share (L1+L2), with census-based adjustments where available. See “Data &amp; method”.</p>`;
  }
  if (state.mode === "multilingual") {
    const subs = d3.groups(Object.entries(countries).filter(([, c]) => c.subregion && c.region), ([, c]) => c.subregion)
      .map(([name, entries]) => ({ name, ...L.regionSummary(entries, y, anchorIdx) })).sort((a, b) => b.index - a.index);
    const regs = REGIONS.map((r) => ({ name: r, ...L.regionSummary(Object.entries(countries).filter(([, c]) => c.region === r), y, anchorIdx) }))
      .sort((a, b) => b.index - a.index);
    const topC = bigCountries().map(([iso2, c]) => ({ iso2, c, v: L.multilingualIndex(L.breakdown(iso2, c, y, anchorIdx)) }))
      .sort((a, b) => b.v - a.v).slice(0, 15);
    const table = (rows) => `<table class="t"><thead><tr><th>Region</th><th class="n">Lang./person</th><th>Top second languages</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${esc(r.name)}</td><td class="n">${r.index.toFixed(2)}</td><td>${r.second.slice(0, 3).map((d) => esc(lname(d.code))).join(", ")}</td></tr>`).join("")}</tbody></table>`;
    return `<h2>Multilingualism, ${y}</h2><p class="sub">Average number of languages a person speaks (upper bound from CLDR L1+L2 shares).</p>
      <h3>By continent</h3>${table(regs)}<h3>By subregion</h3>${table(subs)}
      <h3>Most multilingual countries (pop. ≥ 1 M)</h3>${bars(topC, topC[0].v, {
        name: (d) => `<button data-country="${d.iso2}">${esc(d.c.name)}</button>`, val: (d) => d.v.toFixed(2) })}`;
  }
  if (state.mode === "diversity") {
    const g = await glot();
    const rows = Object.entries(countries).map(([iso2, c]) => ({ iso2, c, v: L.livingLanguagesAt(g[iso2] ?? [], y), lost: (g[iso2] ?? []).filter((r) => r[2] === "extinct" && r[3] >= L.YEAR0 && r[3] < y).length }));
    const top = [...rows].sort((a, b) => b.v - a.v).slice(0, 15);
    const lostByRegion = REGIONS.map((r) => ({ name: r, v: new Set(Object.entries(g).filter(([iso2]) => countries[iso2]?.region === r)
      .flatMap(([, rs]) => rs.filter((x) => x[2] === "extinct" && x[3] >= L.YEAR0 && x[3] < y).map((x) => x[0]))).size }));
    const lostSeries = years().map((yr) => [yr, new Set(Object.values(g).flatMap((rs) => rs.filter((x) => x[2] === "extinct" && x[3] >= L.YEAR0 && x[3] < yr).map((x) => x[0]))).size]);
    return `<h2>Language diversity, ${y}</h2><p class="sub">Languages per country from Glottolog, counting languages still documented in ${y}.</p>
      <h3>Most linguistically diverse countries</h3>${bars(top, top[0].v, { name: (d) => `<button data-country="${d.iso2}">${esc(d.c.name)}</button>`, val: (d) => d.v })}
      <h3>Languages last documented between 1960 and ${y}</h3>${trendChart(lostSeries, {})}
      ${bars(lostByRegion.sort((a, b) => b.v - a.v), Math.max(1, ...lostByRegion.map((d) => d.v)), { name: (d) => esc(d.name), val: (d) => d.v })}
      <p class="note">A language counts as lost from the year after its last documentation (Glottolog “last year of documentation”, extinct languages only). Many extinctions have no recorded date and are not counted.</p>`;
  }
  return reachPanel();
}

function languagePanel(code) {
  const y = state.year, l = languages[code] ?? {};
  const t = L.languageTotal(countries, code, y, anchorIdx);
  const series = years().map((yr) => [yr, L.languageTotal(countries, code, yr, anchorIdx).speakers]);
  const top = t.where.slice(0, 12).map((d) => ({ ...d, v: d.speakers }));
  return `<button class="linkbtn" data-lang="">← All languages</button>
    <h2>${esc(lname(code))}</h2><p class="sub">${esc([l.family, l.macroarea].filter(Boolean).join(" · ") || "Family unknown")}${l.aes ? " · " + esc(l.aes.replace(/_/g, " ")) : ""}</p>
    <div class="stats">
      <div class="stat"><b>${L.formatCount(t.speakers)}</b><span>speakers in ${y}</span></div>
      <div class="stat"><b>${t.where.filter((d) => d.speakers >= 1).length}</b><span>countries</span></div>
      <div class="stat"><b>${l.official_in?.length ?? 0}</b><span>official in</span></div>
    </div>
    <h3>Speakers 1960–${meta.years[1]}</h3>${trendChart(series, { fmt: (v) => L.formatCount(v) })}
    <p class="note">Growth mostly reflects population change; shares are only time-varying where census anchors exist.</p>
    <h3>Where speakers live</h3>${bars(top, top[0]?.v || 1, { name: (d) => `<button data-country="${d.iso2}">${esc(countries[d.iso2].name)}</button>`, val: (d) => `${L.formatCount(d.speakers)} · ${pctf(d.pct)}` })}`;
}

function reachPanel() {
  const y = state.year;
  if (!state.mine.length) return `<h2>Where can I talk?</h2><p class="sub">Add the languages you speak (top-left of the map) and how well. The map shows the chance that a random person in each country shares at least one of them.</p>`;
  const rows = Object.entries(countries).map(([iso2, c]) => {
    const r = L.reachability(L.breakdown(iso2, c, y, anchorIdx), state.mine);
    return { iso2, c, r, people: L.popAt(c, y) * r.estimate };
  });
  const world = d3.sum(rows, (d) => d.people), worldPop = d3.sum(rows, (d) => L.popAt(d.c, y));
  const byRegion = REGIONS.map((name) => {
    const rs = rows.filter((d) => d.c.region === name);
    return { name, v: d3.sum(rs, (d) => d.people) / d3.sum(rs, (d) => L.popAt(d.c, y)) };
  }).sort((a, b) => b.v - a.v);
  const top = rows.filter((d) => L.popAt(d.c, y) >= 1e6).sort((a, b) => b.r.estimate - a.r.estimate).slice(0, 15).map((d) => ({ ...d, v: d.r.estimate }));
  const contrib = state.mine.map((m) => ({ code: m.code, v: d3.sum(rows, (d) => (d.r.best === m.code ? d.people : 0)) })).sort((a, b) => b.v - a.v);
  return `<h2>Where can I talk?</h2><p class="sub">${state.mine.map((m) => `${esc(lname(m.code))} (${m.level})`).join(", ")}</p>
    <div class="stats"><div class="stat"><b>${L.formatCount(world)}</b><span>people you could likely talk with</span></div>
    <div class="stat"><b>${Math.round((100 * world) / worldPop)}%</b><span>of the world, ${y}</span></div></div>
    <h3>By continent</h3>${bars(byRegion, 1, { name: (d) => esc(d.name), val: (d) => Math.round(d.v * 100) + "%" })}
    <h3>Best countries for you (pop. ≥ 1 M)</h3>${bars(top, 1, { name: (d) => `<button data-country="${d.iso2}">${esc(d.c.name)}</button>`, val: (d) => `${Math.round(d.v * 100)}% · via ${esc(lname(d.r.best))}` })}
    <h3>Which of your languages does the most work</h3>${bars(contrib, contrib[0].v || 1, { name: (d) => esc(lname(d.code)), val: (d) => L.formatCount(d.v) })}
    <p class="note">Estimate = 1 − Π(1 − wᵢ·pᵢ), where pᵢ is the share of residents speaking language i and wᵢ your level (native/fluent 1, conversational 0.75, basic 0.4). It assumes speaker groups overlap at random; the country view shows the bounds.</p>`;
}

// ---------- controls ----------
function renderControls() {
  const el = $("#modeControls");
  if (state.mode === "languages") {
    el.innerHTML = `<div class="ctrl"><input list="langList" id="langPick" placeholder="Map a language, e.g. Swahili" value="${esc(state.lang ? lname(state.lang) : "")}" aria-label="Language to map">
      ${state.lang ? `<button class="linkbtn" id="langClear" aria-label="Clear language">✕</button>` : ""}</div>`;
    $("#langPick").addEventListener("change", (e) => { const c = codeFromName(e.target.value); if (c) setLang(c); });
    $("#langClear")?.addEventListener("click", () => setLang(null));
  } else if (state.mode === "reach") {
    el.innerHTML = `<form class="ctrl" id="mineForm">
      ${state.mine.map((m, i) => `<span class="chip">${esc(lname(m.code))} · ${m.level}<button type="button" data-rm="${i}" aria-label="Remove">✕</button></span>`).join("")}
      <input list="langList" id="mineLang" placeholder="Add a language you speak" aria-label="Language">
      <select id="mineLevel" aria-label="Level">${Object.keys(L.LEVEL_WEIGHT).map((k) => `<option>${k}</option>`).join("")}</select>
      <button class="btn">Add</button></form>`;
    $("#mineForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const code = codeFromName($("#mineLang").value);
      if (!code || state.mine.some((m) => m.code === code)) return;
      setMine([...state.mine, { code, level: $("#mineLevel").value }]);
    });
    el.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => setMine(state.mine.filter((_, i) => i !== +b.dataset.rm))));
  } else el.innerHTML = "";
}

function update() { recolor(); renderPanel(); }
function select(iso2) { state.selected = iso2; update(); }
function setLang(code) { state.lang = code || null; setMode("languages"); }
function setMine(mine) { state.mine = mine; store.set("lt.mine", mine); renderControls(); update(); }
async function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-selected", b.dataset.mode === mode));
  if (mode === "diversity") await glot();
  renderControls();
  update();
}

document.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
document.querySelectorAll("[data-proj]").forEach((b) => b.addEventListener("click", () => {
  state.proj = b.dataset.proj;
  document.querySelectorAll("[data-proj]").forEach((x) => x.setAttribute("aria-pressed", x === b));
  setupProjection();
}));
const yearIn = $("#year");
yearIn.max = meta.years[1];
yearIn.addEventListener("input", () => { state.year = +yearIn.value; $("#yearOut").textContent = state.year; update(); });
let timer = null;
$("#play").addEventListener("click", () => {
  if (timer) { clearInterval(timer); timer = null; $("#play").textContent = "▶"; return; }
  if (state.year >= meta.years[1]) yearIn.value = L.YEAR0;
  $("#play").textContent = "❚❚";
  timer = setInterval(() => {
    if (+yearIn.value >= meta.years[1]) { $("#play").click(); return; }
    yearIn.value = +yearIn.value + 1;
    yearIn.dispatchEvent(new Event("input"));
  }, 150);
});
$("#aboutLink").addEventListener("click", (e) => {
  e.preventDefault();
  $("#aboutBody").innerHTML = `<p>${esc(meta.method)}</p><ul>${Object.values(meta.sources).map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
    <p class="note">Tags: <span class="tag measured">measured</span> census value for that year · <span class="tag estimated">estimated</span> interpolated between census years ·
    <span class="tag derived">derived</span> CLDR share (recent) × that year's population, so it ignores language shift.</p>
    <h3>Census anchors</h3><table class="t"><thead><tr><th>Country</th><th>Language</th><th>Metric</th><th>Source</th><th>Conf.</th></tr></thead><tbody>
    ${anchors.series.map((s) => `<tr><td>${esc(countries[s.country]?.name)}</td><td>${esc(lname(s.lang))}</td><td>${esc(s.metric)}</td><td>${esc(s.source)}</td><td>${esc(s.confidence)}</td></tr>`).join("")}</tbody></table>
    <p class="note">${esc(anchors._note)}</p><p class="note">Built ${esc(meta.built_at)}.</p>`;
  $("#about").showModal();
});

setupProjection();
renderControls();
update();
