import * as L from "./logic.js";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const icon = (id) => `<svg class="i" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

const load = (f) => fetch(`data/${f}`).then((r) => r.json());
const [world, countries, languages, anchors, meta] = await Promise.all(
  ["countries-110m.json", "countries.json", "languages.json", "anchors.json", "meta.json"].map(load));
const lazy = (f) => { let p; return () => (p ??= load(f)); };
const loaders = { glot: lazy("glottolog_by_country.json"), gindex: lazy("glottolog_index.json"), dialects: lazy("dialects.json") };
const cache = {};  // resolved lazy files, for synchronous use after loading
const need = (...names) => Promise.all(names.map(async (n) => (cache[n] ??= await loaders[n]())));

const LAST = meta.years[1], PROJ = meta.projected_from;
const state = { mode: "languages", proj: "flat", year: LAST, lang: null, selected: null, mine: store.get("lt.mine", []) };
const anchorIdx = L.indexAnchors(anchors);
const lname = (code) => languages[code]?.name ?? code;
const byNumeric = new Map(Object.entries(countries).map(([iso2, c]) => [c.numeric, iso2]));
const features = topojson.feature(world, world.objects.countries).features;
for (const f of features) f.iso2 = byNumeric.get(String(f.id));
const land = { type: "FeatureCollection", features: features.filter((f) => f.iso2 !== "AQ") };
const REGIONS = ["Africa", "Americas", "Asia", "Europe", "Oceania"];
const bigCountries = () => Object.entries(countries).filter(([, c]) => L.popAt(c, state.year) >= 1e6);
const isGlotto = (lang) => !!lang && lang.startsWith("g:");

// ---------- colour ----------
const DOM_PALETTE = ["#1d5fbf", "#e03131", "#f59f00", "#2f9e44", "#d6336c", "#1098ad", "#f76707", "#66a80f", "#0b7285", "#a0522d", "#a61e4d", "#e8b100"];
const RAMPS = {
  languages: ["#e3eefc", "#6fa3ec", "#1d5fbf", "#0a2a5e"],
  multilingual: ["#e3f6e8", "#6cc684", "#2f9e44", "#0b3d1a"],
  diversity: ["#fff0e0", "#ffa94d", "#f76707", "#6e2600"],
  reach: ["#e0f6f9", "#3bc9db", "#0c8599", "#043a44"],
};
// Regional Arabic varieties that CLDR lists separately are coloured as Arabic in the "most spoken" layer.
const ARABIC = new Set(["arz", "ary", "arq", "aeb", "apc", "ars", "acm", "shu", "ajp", "afb", "ayl", "ayh", "acq", "apd", "ssh"]);
const dominantAt = (iso2) => {
  const top = L.breakdown(iso2, countries[iso2], state.year, anchorIdx)[0];
  return top && (ARABIC.has(top.code) ? { ...top, code: "ar" } : top);
};
const domColors = (() => {  // the palette goes to the languages that are most spoken by the most people
  const pop = d3.rollup(Object.keys(countries).filter((k) => dominantAt(k)), (v) => d3.sum(v, (k) => L.popAt(countries[k], state.year)), (k) => dominantAt(k).code);
  return new Map([...pop].sort((a, b) => b[1] - a[1]).slice(0, DOM_PALETTE.length).map(([c], i) => [c, DOM_PALETTE[i]]));
})();
const otherColor = (code) => {  // stable mid-saturation tone for languages outside the legend
  let h = 0;
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return d3.hsl(h, 0.45, 0.66).formatHex();
};
const langColor = (code) => domColors.get(ARABIC.has(code) ? "ar" : code) ?? otherColor(code);
const seq = (domain, ramp, kind) => {
  const s = kind === "log" ? d3.scaleSequentialLog() : kind === "sqrt" ? d3.scaleSequentialSqrt() : d3.scaleSequential();
  return s.domain(domain).interpolator(d3.piecewise(d3.interpolateLab, ramp)).clamp(true);
};

// ---------- map ----------
const svg = d3.select("#map");
const gRoot = svg.append("g");
const sphere = gRoot.append("path").attr("class", "sphere").datum({ type: "Sphere" });
const grat = gRoot.append("path").attr("class", "graticule").datum(d3.geoGraticule10());
const paths = gRoot.selectAll("path.country").data(land.features).join("path").attr("class", "country").attr("vector-effect", "non-scaling-stroke");
const gPts = gRoot.append("g");
let projection, path, baseScale, rot = [-15, -25], last = d3.zoomIdentity, resetting = false, points = [];

function setupProjection() {
  const { width: w, height: h } = svg.node().getBoundingClientRect();
  if (!w || !h) return;
  if (state.proj === "globe") {
    projection = d3.geoOrthographic().rotate(rot).clipAngle(90).fitExtent([[16, 16], [w - 16, h - 16]], { type: "Sphere" });
  } else {  // flat map fitted to the inhabited land, so it opens zoomed in past the empty poles
    projection = d3.geoEqualEarth().fitExtent([[8, 8], [w - 8, h - 8]], land);
  }
  baseScale = projection.scale();
  path = d3.geoPath(projection);
  resetting = true;
  svg.call(zoom.transform, d3.zoomIdentity);
  resetting = false;
  last = d3.zoomIdentity;
  gRoot.attr("transform", null);
  draw();
  // the flat map opens zoomed in on the populated latitudes
  if (state.proj === "flat") svg.call(zoom.transform, d3.zoomIdentity.translate(w / 2, h / 2).scale(1.3).translate(-w / 2, -h * 0.47));
}
function draw() {
  sphere.attr("d", path);
  grat.attr("d", path);
  paths.attr("d", path);
  drawPoints();
}
function drawPoints() {
  if (!projection) return;
  const k = state.proj === "flat" ? last.k : 1;
  const center = state.proj === "globe" ? [-rot[0], -rot[1]] : null;
  gPts.selectAll("circle").data(points.filter((p) => !center || d3.geoDistance(p.at, center) < Math.PI / 2))
    .join("circle").attr("class", (p) => (p.main ? "pt main" : "pt"))
    .attr("cx", (p) => projection(p.at)[0]).attr("cy", (p) => projection(p.at)[1])
    .attr("r", (p) => (p.main ? 5 : 2.5) / Math.sqrt(k)).attr("stroke-width", (p) => (p.main ? 2 : 0.8) / k);
}
const zoom = d3.zoom().scaleExtent([0.7, 12]).clickDistance(4).on("zoom", (e) => {
  if (resetting) return;
  const t = e.transform;
  if (state.proj === "flat") { gRoot.attr("transform", t); last = t; drawPoints(); return; }
  if (e.sourceEvent && e.sourceEvent.type !== "wheel") {
    rot = [rot[0] + ((t.x - last.x) * 0.3) / t.k, Math.max(-75, Math.min(75, rot[1] - ((t.y - last.y) * 0.3) / t.k))];
    projection.rotate(rot);
  }
  projection.scale(baseScale * t.k);
  last = t;
  draw();
});
svg.call(zoom);
new ResizeObserver(() => setupProjection()).observe(svg.node());
$("#zoomIn").addEventListener("click", () => svg.transition().duration(250).call(zoom.scaleBy, 1.6));
$("#zoomOut").addEventListener("click", () => svg.transition().duration(250).call(zoom.scaleBy, 1 / 1.6));
$("#zoomReset").addEventListener("click", () => { rot = [-15, -25]; setupProjection(); });

// ---------- layers ----------
function layer() {
  const y = state.year, out = new Map();
  if (state.mode === "languages" && isGlotto(state.lang)) {
    const entry = cache.gindex?.[state.lang.slice(2)];
    for (const c of (entry?.[5] ?? "").split(" ").filter(Boolean)) out.set(c, 1);
    return out;
  }
  if (state.mode === "diversity") {
    for (const iso2 of Object.keys(countries)) out.set(iso2, cache.glot ? L.livingLanguagesAt(cache.glot[iso2] ?? [], y) || null : null);
    return out;
  }
  for (const [iso2, c] of Object.entries(countries)) {
    const b = L.breakdown(iso2, c, y, anchorIdx);
    if (!b.length) { out.set(iso2, null); continue; }
    if (state.mode === "languages" && !state.lang) out.set(iso2, dominantAt(iso2).code);
    else if (state.mode === "languages") out.set(iso2, b.find((l) => l.code === state.lang)?.pct ?? null);
    else if (state.mode === "multilingual") out.set(iso2, L.multilingualIndex(b));
    else if (state.mode === "reach" && state.mine.length) {
      const r = L.reachability(b, state.mine);
      out.set(iso2, r.missing.length === state.mine.length ? null : r);  // no figure for any of your languages = unknown
    } else out.set(iso2, null);
  }
  return out;
}
function scaleForMode() {
  if (state.mode === "languages" && isGlotto(state.lang)) return () => css("--chart-3");
  if (state.mode === "languages" && !state.lang) return (code) => langColor(code);
  if (state.mode === "languages") return seq([0, 100], RAMPS.languages, "sqrt");
  if (state.mode === "multilingual") return seq([1, 3], RAMPS.multilingual);
  if (state.mode === "diversity") return seq([1, 800], RAMPS.diversity, "log");
  const s = seq([0, 1], RAMPS.reach);
  return (r) => s(r.estimate);
}

let current = new Map();
function recolor() {
  current = layer();
  const sc = scaleForMode();
  paths.attr("fill", (f) => { const v = current.get(f.iso2); return v == null ? css("--nodata") : sc(v); })
    .classed("selected", (f) => f.iso2 && f.iso2 === state.selected);
  renderLegend();
}

function renderLegend() {
  const el = $("#legend");
  const nodata = `<span><i class="sw" style="background:${css("--nodata")}"></i>No data</span>`;
  if (state.mode === "languages" && !state.lang) {
    el.innerHTML = `<b>Most spoken language, ${state.year}</b><div class="cats">${[...domColors]
      .map(([c, col]) => `<span><i class="sw" style="background:${col}"></i>${esc(c === "ar" ? "Arabic (all varieties)" : lname(c))}</span>`).join("")}
      <span><i class="sw" style="background:${otherColor("xx")}"></i>Other languages (hover)</span>${nodata}</div>`;
    return;
  }
  if (state.mode === "languages" && isGlotto(state.lang)) {
    const e = cache.gindex?.[state.lang.slice(2)];
    el.innerHTML = `<b>Where ${esc(e?.[0] ?? "this language")} is spoken</b><div class="cats"><span><i class="sw" style="background:${css("--chart-3")}"></i>Country (Glottolog)</span>
      <span><i class="sw" style="background:${css("--negative")};border-radius:50%"></i>Language location</span><span><i class="sw" style="background:${css("--text")};border-radius:50%"></i>Dialects</span></div>`;
    return;
  }
  const mode = state.mode;
  const [title, ticks] = {
    languages: [`Share of people who speak ${lname(state.lang)}`, ["0%", "25%", "100%"]],
    multilingual: ["Languages per person (first + second)", ["1", "2", "3+"]],
    diversity: [`Living languages, ${state.year} (Glottolog)`, ["1", "30", "800"]],
    reach: ["Chance a random resident shares a language with you", ["0%", "50%", "100%"]],
  }[mode];
  const stops = d3.range(0, 1.001, 0.1).map((t) => d3.piecewise(d3.interpolateLab, RAMPS[mode])(t)).join(",");
  const ramp = `linear-gradient(90deg,${stops})`; // taste-skill-ignore: the legend ramp is the colour scale itself
  const pts = mode === "languages" ? `<span><i class="sw" style="background:${css("--negative")};border-radius:50%"></i>Where Glottolog places it</span>` : "";
  el.innerHTML = `<b>${esc(title)}</b><div class="ramp" style="background:${ramp}"></div>
    <div class="ticks">${ticks.map((t) => `<span>${t}</span>`).join("")}</div><div class="cats">${nodata}${pts}</div>`;
}

// ---------- tooltip: every language spoken in the hovered country ----------
const tip = $("#tooltip");
function tooltipHTML(iso2) {
  const c = countries[iso2], y = state.year, v = current.get(iso2);
  const b = L.breakdown(iso2, c, y, anchorIdx);
  let key = "";
  if (state.mode === "reach" && state.mine.length) {
    key = v == null ? "No figures for your languages here" : `${v.missing.length ? "At least " : "~"}${L.formatPct(v.estimate * 100)} could talk with you${v.missing.length ? ` (no data for ${v.missing.map(lname).join(", ")})` : ""}`;
  } else if (state.mode === "multilingual") key = v == null ? "No data" : `${v.toFixed(2)} languages per person`;
  else if (state.mode === "diversity") key = v == null ? "No data" : `${v} living languages`;
  else if (state.mode === "languages" && state.lang && !isGlotto(state.lang)) key = `${lname(state.lang)}: ${v == null ? "no figure" : L.formatPct(v)}`;
  const list = b.slice(0, 7).map((l) => `<div class="tt-row"><span>${esc(lname(l.code))}</span><span>${L.formatPct(l.pct)}</span>
    <span class="tt-bar"><i style="width:${Math.max(1, l.pct)}%;background:${langColor(l.code)}"></i></span></div>`).join("");
  return `<div class="tt-head"><span>${esc(c.name)}</span><span>${L.formatCount(L.popAt(c, y))}</span></div>
    <div class="tt-sub">${esc(c.subregion ?? "")}</div>${key ? `<div class="tt-key">${esc(key)}</div>` : ""}
    ${list || `<div class="tt-sub">No language shares recorded</div>`}
    <div class="tt-foot">${b.length > 7 ? `+${b.length - 7} more with shares · ` : ""}${c.glottolog.count} languages in Glottolog</div>`;
}
paths.on("pointermove", (e, f) => {
  if (!countries[f.iso2]) return;
  const box = $(".mapcard");
  const [x, y] = d3.pointer(e, box);
  tip.hidden = false;
  tip.innerHTML = tooltipHTML(f.iso2);
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  tip.style.left = (x + 16 + tw > box.clientWidth ? x - tw - 12 : x + 16) + "px";
  tip.style.top = Math.max(8, Math.min(y + 12, box.clientHeight - th - 8)) + "px";
}).on("pointerleave", () => (tip.hidden = true))
  .on("click", (e, f) => { if (countries[f.iso2]) select(f.iso2); });

// ---------- charts ----------
const years = () => d3.range(L.YEAR0, LAST + 1);
function trendChart(series, { anchorsPts = [], fmt = (v) => v, yMax } = {}) {
  const w = 340, h = 132, m = { t: 8, r: 6, b: 20, l: 44 };
  const x = d3.scaleLinear([L.YEAR0, LAST], [m.l, w - m.r]);
  const y = d3.scaleLinear([0, yMax ?? (d3.max(series, (d) => d[1]) * 1.08 || 1)], [h - m.b, m.t]).nice(4);
  const s = d3.create("svg").attr("class", "trend").attr("viewBox", `0 0 ${w} ${h}`).attr("role", "img");
  s.append("g").attr("class", "grid").selectAll("line").data(y.ticks(4)).join("line")
    .attr("x1", m.l).attr("x2", w - m.r).attr("y1", y).attr("y2", y);
  s.append("g").attr("class", "axis").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(5).tickFormat(d3.format("d")).tickSize(0).tickPadding(6));
  s.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(fmt).tickSize(0).tickPadding(6));
  const line = d3.line().x((d) => x(d[0])).y((d) => y(d[1]));
  s.append("path").attr("class", "line").attr("d", line(series.filter((d) => d[0] < PROJ)));
  s.append("path").attr("class", "proj").attr("d", line(series.filter((d) => d[0] >= PROJ - 1)));
  s.selectAll("circle").data(anchorsPts.filter(([yr]) => yr >= L.YEAR0)).join("circle").attr("cx", (d) => x(d[0])).attr("cy", (d) => y(d[1])).attr("r", 3);
  s.append("line").attr("class", "cursor").attr("x1", x(state.year)).attr("x2", x(state.year)).attr("y1", m.t).attr("y2", h - m.b);
  return s.node().outerHTML;
}

const rows = (items, max, { name, val, badges, bar = true }) => `<ul class="rows">${items.map((d) => `
  <li class="row"><span class="name">${name(d)}${badges ? `<span class="badges">${badges(d)}</span>` : ""}</span>
  <span class="val">${val(d)}</span>${bar ? `<span class="bar"><i style="width:${Math.max(0.5, Math.min(100, (100 * d.v) / max))}%"></i></span>` : ""}</li>`).join("")}</ul>`;
const langBtn = (code) => `<button data-lang="${esc(code)}">${esc(lname(code))}</button>`;
const countryBtn = (iso2) => `<button data-country="${iso2}">${esc(countries[iso2]?.name ?? iso2)}</button>`;
const kpis = (items) => `<div class="kpis">${items.map(([label, value]) => `<div class="kpi"><span>${label}</span><b>${value}</b></div>`).join("")}</div>`;
const projectedNote = () => (state.year >= PROJ ? `<p class="note">${state.year} population is projected from 2019–2024 growth.</p>` : "");
const provBadge = { measured: `<span class="badge good" title="Census value for this year">census</span>`, estimated: `<span class="badge warn" title="Interpolated between census years">interpolated</span>`, derived: "" };
const officialLabel = { official: "official", de_facto_official: "official", official_regional: "regional", official_minority: "minority" };

// ---------- panels ----------
async function renderPanel() {
  const el = $("#panel");
  el.innerHTML = state.selected ? await countryPanel(state.selected) : await overviewPanel();
  el.querySelectorAll("[data-lang]").forEach((b) => b.addEventListener("click", () => setLang(b.dataset.lang)));
  el.querySelectorAll("[data-country]").forEach((b) => b.addEventListener("click", () => select(b.dataset.country)));
  el.querySelectorAll("[data-back]").forEach((b) => b.addEventListener("click", () => (b.dataset.back === "lang" ? setLang(null) : select(null))));
  el.querySelectorAll(".filter").forEach((f) => f.addEventListener("input", () => {
    const q = f.value.toLowerCase();
    f.parentElement.querySelectorAll("tbody tr, li").forEach((tr) => (tr.hidden = !tr.textContent.toLowerCase().includes(q)));
  }));
}

async function countryPanel(iso2) {
  await need("glot");
  const c = countries[iso2], y = state.year;
  const b = L.breakdown(iso2, c, y, anchorIdx);
  const gl = cache.glot[iso2] ?? [];
  const lost = gl.filter((g) => g[2] === "extinct" && g[3] >= L.YEAR0).sort((a, z) => z[3] - a[3]);
  const nDialects = d3.sum(gl, (g) => g[5]);
  let html = `<button class="btn ghost back" data-back="world">${icon("back")}World overview</button>
    <h2>${esc(c.name)}</h2><p class="sub">${esc([c.subregion, c.region].filter(Boolean).join(" · "))}</p>
    ${kpis([[`People, ${y}`, L.formatCount(L.popAt(c, y))], ["Languages per person", b.length ? L.multilingualIndex(b).toFixed(2) : "–"],
      ["Living languages", L.livingLanguagesAt(gl, y)]])}${projectedNote()}`;
  if (state.mine.length) {
    const r = L.reachability(b, state.mine);
    html += `<div class="callout"><b>${r.missing.length ? "≥ " : "~"}${L.formatPct(r.estimate * 100)}</b> of people here likely share a language with you
      (range ${L.formatPct(r.low * 100)}–${L.formatPct(r.high * 100)})${r.best ? `, mostly via ${esc(lname(r.best))}` : ""}.
      ${r.missing.length ? `<p class="note">No figure for ${esc(r.missing.map(lname).join(", "))} in this country, so this is a lower bound.</p>` : ""}</div>`;
  }
  const lv = b.map((l) => ({ ...l, v: l.pct }));
  const opts = {
    name: (l) => langBtn(l.code),
    badges: (l) => [l.official ? `<span class="badge blue">${officialLabel[l.official] ?? esc(l.official)}</span>` : "",
      l.src === "wikipedia" ? `<span class="badge" title="Wikipedia L1+L2 table; CLDR lists ${l.cldr_pct == null ? "no figure" : L.formatPct(l.cldr_pct)}">wiki</span>` : "", provBadge[l.provenance]].join(""),
    val: (l) => `<b>${L.formatPct(l.pct)}</b> · ${L.formatCount(l.speakers)}`,
  };
  html += `<h3>Languages spoken</h3>`;
  html += !b.length ? `<p class="note">CLDR records no language shares here.</p>` : rows(lv.slice(0, 10), 100, opts) +
    (lv.length > 10 ? `<details><summary>${lv.length - 10} more languages</summary>${rows(lv.slice(10), 100, opts)}</details>` : "");
  html += `<p class="note">Shares count first- and second-language speakers, so they can add up to more than 100%. “wiki” marks a second-language figure from Wikipedia’s speaker tables where CLDR had none or a lower one.</p>`;
  for (const l of b.filter((x) => x.series)) {
    const s = l.series;
    html += `<h3>${esc(lname(l.code))} over time</h3>${trendChart(years().map((yr) => [yr, L.interpolate(s.points, yr)]), { anchorsPts: s.points, fmt: (v) => v + "%" })}
      <p class="note">${esc(s.metric)}. ${esc(s.source)}. Circles are census values; the line between them is interpolated. Confidence: ${esc(s.confidence)}.</p>`;
  }
  if (c.subregion) {
    const reg = L.regionSummary(Object.entries(countries).filter(([, x]) => x.subregion === c.subregion), y, anchorIdx);
    html += `<h3>Second languages in ${esc(c.subregion)}</h3><p class="note" style="margin:0 0 6px">${reg.index.toFixed(2)} languages per person across the subregion.</p>
      ${rows(reg.second.slice(0, 6).map((d) => ({ ...d, v: d.speakers })), reg.second[0]?.speakers || 1, { name: (d) => langBtn(d.code), val: (d) => L.formatCount(d.speakers) })}`;
  }
  if (lost.length) html += `<h3>Languages lost since 1960</h3><p>${lost.map((g) => `${esc(g[0])} <span class="note">(${g[3]})</span>`).join(", ")}</p>`;
  if (gl.length) html += `<h3>All ${gl.length} languages and ${nDialects} dialects recorded here</h3><details><summary>Show the Glottolog list</summary>
    <input class="filter" type="search" placeholder="Filter by name, family or status" aria-label="Filter languages">
    <table class="t"><thead><tr><th>Language</th><th>Family</th><th>Status</th><th class="n">Dialects</th></tr></thead><tbody>
    ${gl.map((g) => `<tr><td><button data-lang="g:${g[4]}">${esc(g[0])}</button></td><td>${esc(g[1])}</td><td>${esc((g[2] ?? "–").replace(/_/g, " "))}</td><td class="n">${g[5] || "–"}</td></tr>`).join("")}
    </tbody></table></details>`;
  return html;
}

async function overviewPanel() {
  const y = state.year;
  if (state.mode === "languages" && isGlotto(state.lang)) return glottoPanel(state.lang.slice(2));
  if (state.mode === "languages" && state.lang) return languagePanel(state.lang);
  if (state.mode === "languages") {
    const top = L.topLanguages(countries, y, anchorIdx, 20);
    return `<h2>Most spoken languages</h2><p class="sub">First- and second-language speakers in ${y}. Hover the map for each country’s languages; click a country or a language for detail.</p>
      ${kpis([["With speaker data", Object.keys(languages).length], ["In Glottolog", "8,618"], ["Dialects", "13,706"]])}
      <h3>Top 20 worldwide</h3>${rows(top.map((d) => ({ ...d, v: d.speakers })), top[0].speakers, { name: (d) => langBtn(d.code), val: (d) => `<b>${L.formatCount(d.speakers)}</b>` })}
      <p class="note">Speakers = population × share. Shares come from Unicode CLDR, raised to Wikipedia’s L1+L2 figure where that is higher, and follow census data where it exists. See Data &amp; method.</p>${projectedNote()}`;
  }
  if (state.mode === "multilingual") {
    const sum = (entries) => L.regionSummary(entries, y, anchorIdx);
    const subs = d3.groups(Object.entries(countries).filter(([, c]) => c.subregion && c.region), ([, c]) => c.subregion)
      .map(([name, e]) => ({ name, ...sum(e) })).sort((a, b) => b.index - a.index);
    const regs = REGIONS.map((r) => ({ name: r, ...sum(Object.entries(countries).filter(([, c]) => c.region === r)) })).sort((a, b) => b.index - a.index);
    const topC = bigCountries().map(([iso2, c]) => ({ iso2, v: L.multilingualIndex(L.breakdown(iso2, c, y, anchorIdx)) })).sort((a, b) => b.v - a.v).slice(0, 12);
    const table = (rs) => `<table class="t"><thead><tr><th>Region</th><th class="n">Per person</th><th>Top second languages</th></tr></thead><tbody>
      ${rs.map((r) => `<tr><td>${esc(r.name)}</td><td class="n">${r.index.toFixed(2)}</td><td>${r.second.slice(0, 3).map((d) => langBtn(d.code)).join(", ")}</td></tr>`).join("")}</tbody></table>`;
    return `<h2>Multilingualism</h2><p class="sub">Average number of languages a person speaks in ${y}, counting first and second languages.</p>
      <h3>By continent</h3>${table(regs)}<h3>Most multilingual countries</h3>
      ${rows(topC, topC[0].v, { name: (d) => countryBtn(d.iso2), val: (d) => `<b>${d.v.toFixed(2)}</b>` })}
      <p class="note">Countries of 1 M people or more. CLDR lists Standard Arabic and the local Arabic varieties separately, which raises North Africa.</p>
      <h3>By subregion</h3>${table(subs)}`;
  }
  if (state.mode === "diversity") {
    await need("glot", "gindex");
    const g = cache.glot;
    const top = Object.keys(countries).map((iso2) => ({ iso2, v: L.livingLanguagesAt(g[iso2] ?? [], y) })).sort((a, b) => b.v - a.v).slice(0, 12);
    const lostIn = (rs, yr) => rs.filter((x) => x[2] === "extinct" && x[3] >= L.YEAR0 && x[3] < yr).map((x) => x[0]);
    const lostSeries = years().map((yr) => [yr, new Set(Object.values(g).flatMap((rs) => lostIn(rs, yr))).size]);
    const mostDialects = Object.entries(cache.gindex).map(([id, e]) => ({ id, name: e[0], v: e[7], fam: e[1] })).sort((a, b) => b.v - a.v).slice(0, 10);
    return `<h2>Diversity and dialects</h2><p class="sub">Languages still documented in ${y}, by country (Glottolog).</p>
      <h3>Most linguistically diverse countries</h3>${rows(top, top[0].v, { name: (d) => countryBtn(d.iso2), val: (d) => `<b>${d.v}</b>` })}
      <h3>Languages with the most recorded dialects</h3>${rows(mostDialects, mostDialects[0].v, { name: (d) => `<button data-lang="g:${d.id}">${esc(d.name)}</button>`, val: (d) => `<b>${d.v}</b> · ${esc(d.fam)}` })}
      <h3>Languages last documented, 1960–${y}</h3>${trendChart(lostSeries, {})}
      <p class="note">A language counts as lost from the year after its last documentation (extinct languages with a recorded date only). Many extinctions have no date and are not counted.</p>`;
  }
  return reachPanel();
}

function languagePanel(code) {
  const y = state.year, l = languages[code] ?? {};
  const t = L.languageTotal(countries, code, y, anchorIdx);
  const series = years().map((yr) => [yr, L.languageTotal(countries, code, yr, anchorIdx).speakers]);
  const top = t.where.filter((d) => d.speakers >= 1).slice(0, 12).map((d) => ({ ...d, v: d.speakers }));
  const dl = l.glottocode ? cache.dialects?.[l.glottocode] ?? [] : [];
  return `<button class="btn ghost back" data-back="lang">${icon("back")}All languages</button>
    <h2>${esc(lname(code))}</h2><p class="sub">${esc([l.family, l.macroarea, l.aes?.replace(/_/g, " ")].filter(Boolean).join(" · ") || "Family not recorded")}</p>
    ${kpis([[`Speakers, ${y}`, L.formatCount(t.speakers)], ["Countries", t.where.filter((d) => d.speakers >= 1).length], ["Dialects", l.dialects ?? "–"]])}${projectedNote()}
    <h3>Speakers, 1960–${LAST}</h3>${trendChart(series, { fmt: (v) => L.formatCount(v).replace(" ", "") })}
    <p class="note">Change mostly follows population; a language’s share only moves where census data exists. Dashed: projected.</p>
    <h3>Where speakers live</h3>${rows(top, top[0]?.v || 1, { name: (d) => countryBtn(d.iso2), val: (d) => `<b>${L.formatCount(d.speakers)}</b> · ${L.formatPct(d.pct)}` })}
    ${dialectList(dl)}`;
}

function glottoPanel(id) {
  const e = cache.gindex?.[id];
  if (!e) return `<p class="note">Loading…</p>`;
  const [name, family, , , aes, where, , nd] = e;
  const cs = where.split(" ").filter((c) => countries[c]);
  return `<button class="btn ghost back" data-back="lang">${icon("back")}All languages</button>
    <h2>${esc(name)}</h2><p class="sub">${esc([family, aes?.replace(/_/g, " ")].filter(Boolean).join(" · "))}</p>
    ${kpis([["Countries", cs.length], ["Dialects", nd], ["Status", esc(aes?.replace(/_/g, " ") ?? "–")]])}
    <p class="note">Glottolog records where this language is spoken but no speaker count, so it has no share on the map. Red dot: its location; dark dots: its dialects.</p>
    <h3>Spoken in</h3>${cs.length ? `<p>${cs.map(countryBtn).join(", ")}</p>` : `<p class="note">No country recorded.</p>`}
    ${dialectList(cache.dialects?.[id] ?? [])}`;
}

const dialectList = (dl) => !dl.length ? "" : `<h3>${dl.length} dialects (Glottolog)</h3>
  <details ${dl.length <= 12 ? "open" : ""}><summary>Show dialects</summary>${dl.length > 12 ? `<input class="filter" type="search" placeholder="Filter dialects" aria-label="Filter dialects">` : ""}
  <ul class="rows">${dl.map((d) => `<li class="row"><span class="name"><span>${esc(d[0])}</span></span></li>`).join("")}</ul></details>`;

function reachPanel() {
  const y = state.year;
  if (!state.mine.length) return `<h2>Where can I talk?</h2><p class="sub">Add the languages you speak and how well, in the left column. The map shows the chance that a random person in each country shares at least one of them.</p>`;
  const all = Object.entries(countries).map(([iso2, c]) => {
    const r = L.reachability(L.breakdown(iso2, c, y, anchorIdx), state.mine);
    return { iso2, c, r, pop: L.popAt(c, y), people: L.popAt(c, y) * r.estimate };
  });
  const people = d3.sum(all, (d) => d.people), worldPop = d3.sum(all, (d) => d.pop);
  const byRegion = REGIONS.map((name) => { const rs = all.filter((d) => d.c.region === name); return { name, v: d3.sum(rs, (d) => d.people) / d3.sum(rs, (d) => d.pop) }; }).sort((a, b) => b.v - a.v);
  const top = all.filter((d) => d.pop >= 1e6).sort((a, b) => b.r.estimate - a.r.estimate).slice(0, 12).map((d) => ({ ...d, v: d.r.estimate }));
  const contrib = state.mine.map((m) => ({ code: m.code, v: d3.sum(all, (d) => (d.r.best === m.code ? d.people : 0)) })).sort((a, b) => b.v - a.v);
  const gaps = all.filter((d) => d.pop >= 1e7 && d.r.missing.length).sort((a, b) => b.pop - a.pop).slice(0, 8);
  return `<h2>Where can I talk?</h2><p class="sub">${state.mine.map((m) => `${esc(lname(m.code))} (${m.level})`).join(", ")}</p>
    ${kpis([["People you could likely talk with", L.formatCount(people)], [`Share of the world, ${y}`, L.formatPct((100 * people) / worldPop)], ["Countries above 50%", all.filter((d) => d.r.estimate >= 0.5).length]])}
    <h3>By continent</h3>${rows(byRegion, 1, { name: (d) => esc(d.name), val: (d) => `<b>${L.formatPct(d.v * 100)}</b>` })}
    <h3>Best countries for you</h3>${rows(top, 1, { name: (d) => countryBtn(d.iso2), val: (d) => `<b>${L.formatPct(d.v * 100)}</b> · via ${esc(lname(d.r.best))}` })}
    <h3>Which of your languages does the most work</h3>${rows(contrib, contrib[0].v || 1, { name: (d) => esc(lname(d.code)), val: (d) => `<b>${L.formatCount(d.v)}</b>` })}
    ${gaps.length ? `<h3>Large countries with missing figures</h3><p class="note" style="margin-top:0">These have no figure for at least one of your languages, so their value is a lower bound:</p><p>${gaps.map((d) => `${countryBtn(d.iso2)} <span class="note">(${d.r.missing.map(lname).join(", ")})</span>`).join(", ")}</p>` : ""}
    <p class="note">Estimate = 1 − Π(1 − wᵢ·pᵢ): pᵢ is the share of residents who speak language i, wᵢ your level (native and fluent 1, conversational 0.75, basic 0.4). It assumes speaker groups overlap at random; each country shows its bounds.</p>`;
}

// ---------- combobox ----------
function combobox(el, { placeholder, label, search, onPick }) {
  el.innerHTML = `<div class="combo"><div class="field">${icon("search")}<input type="text" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-label="${esc(label)}" placeholder="${esc(placeholder)}" autocomplete="off"></div><ul role="listbox" hidden></ul></div>`;
  const input = $("input", el), list = $("ul", el);
  let items = [], active = -1;
  const close = () => { list.hidden = true; input.setAttribute("aria-expanded", "false"); };
  const paint = () => {
    list.innerHTML = items.length ? items.map((it, i) => `<li role="option" data-i="${i}" aria-selected="${i === active}"><span>${esc(it.label)}</span><small>${esc(it.sub ?? "")}</small></li>`).join("")
      : `<li class="empty">No match</li>`;
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  };
  const pick = (it) => { if (!it) return; input.value = ""; close(); onPick(it); };
  input.addEventListener("input", async () => {
    const q = input.value;
    if (!q.trim()) return close();
    items = await search(q);
    if (input.value !== q) return;
    active = items.length ? 0 : -1;
    paint();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (!items.length) return; active = (active + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length; paint(); }
    else if (e.key === "Enter") { e.preventDefault(); pick(items[active]); }
    else if (e.key === "Escape") close();
  });
  list.addEventListener("pointerdown", (e) => { const li = e.target.closest("[data-i]"); if (li) { e.preventDefault(); pick(items[+li.dataset.i]); } });
  input.addEventListener("blur", () => setTimeout(close, 100));
  return input;
}
const cldrItems = Object.entries(languages).filter(([, l]) => l.speakers > 0).sort((a, b) => b[1].speakers - a[1].speakers)
  .map(([code, l]) => ({ name: l.name, label: l.name, sub: `${L.formatCount(l.speakers)} speakers`, value: code }));
let fullItems = null;
async function allLanguageItems() {  // languages with shares first, then every Glottolog language, then dialects
  if (fullItems) return fullItems;
  await need("gindex", "dialects");
  const withShares = new Set(Object.values(languages).map((l) => l.glottocode).filter(Boolean));
  const glottoOnly = Object.entries(cache.gindex).filter(([id]) => !withShares.has(id))
    .map(([id, e]) => ({ name: e[0], label: e[0], sub: e[1], value: e[6] && languages[e[6]] ? e[6] : `g:${id}` }));
  const dial = Object.entries(cache.dialects).flatMap(([parent, ds]) => ds.map((d) => ({
    name: d[0], label: d[0], sub: `dialect of ${cache.gindex[parent]?.[0] ?? parent}`, value: languages[cache.gindex[parent]?.[6]] ? cache.gindex[parent][6] : `g:${parent}` })));
  return (fullItems = cldrItems.concat(glottoOnly, dial));
}

// ---------- side controls ----------
const LEVELS = Object.keys(L.LEVEL_WEIGHT);
function renderControls() {
  const el = $("#modeControls");
  if (state.mode === "languages") {
    const current = isGlotto(state.lang) ? cache.gindex?.[state.lang.slice(2)]?.[0] ?? "" : lname(state.lang);
    el.innerHTML = `<div id="langCombo"></div>${state.lang ? `<button class="btn outline" id="langClear">${icon("x")}Clear ${esc(current)}</button>`
      : `<p class="hint">Search 8,600 languages and 13,700 dialects.</p>`}`;
    combobox($("#langCombo"), { placeholder: "Find a language or dialect", label: "Find a language or dialect",
      search: async (q) => L.searchByName(await allLanguageItems(), q), onPick: (it) => setLang(it.value) });
    $("#langClear")?.addEventListener("click", () => setLang(null));
  } else if (state.mode === "reach") {
    el.innerHTML = `<p class="hint">Languages you speak</p><div class="chips">${state.mine.map((m, i) => `<span class="chip">${esc(lname(m.code))}
      <select data-level="${i}" aria-label="Level for ${esc(lname(m.code))}">${LEVELS.map((k) => `<option ${k === m.level ? "selected" : ""}>${k}</option>`).join("")}</select>
      <button data-rm="${i}" aria-label="Remove ${esc(lname(m.code))}">${icon("x")}</button></span>`).join("")}</div>
      <div id="mineCombo"></div><p class="hint">New languages are added as fluent; change the level on the chip.</p>`;
    combobox($("#mineCombo"), { placeholder: "Add a language you speak", label: "Add a language you speak",
      search: async (q) => L.searchByName(cldrItems, q).filter((it) => !state.mine.some((m) => m.code === it.value)),
      onPick: (it) => setMine([...state.mine, { code: it.value, level: "fluent" }]) });
    el.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => setMine(state.mine.filter((_, i) => i !== +b.dataset.rm))));
    el.querySelectorAll("[data-level]").forEach((s) => s.addEventListener("change", () => setMine(state.mine.map((m, i) => (i === +s.dataset.level ? { ...m, level: s.value } : m)))));
  } else el.innerHTML = `<p class="hint">${state.mode === "multilingual" ? "Darker green: people speak more languages on average." : "Darker orange: more living languages. The panel lists dialects and languages lost since 1960."}</p>`;
}

// ---------- language location points ----------
async function updatePoints() {
  points = [];
  if (state.mode === "languages" && state.lang) {
    await need("gindex", "dialects");
    const id = isGlotto(state.lang) ? state.lang.slice(2) : languages[state.lang]?.glottocode;
    const e = id && cache.gindex[id];
    if (e) {
      points = (cache.dialects[id] ?? []).filter((d) => d[1] != null).map((d) => ({ at: [d[2], d[1]] }));
      if (e[2] != null) points.push({ at: [e[3], e[2]], main: true });
    }
  }
  drawPoints();
}

// ---------- state changes ----------
async function update() { recolor(); await renderPanel(); }
function select(iso2) { state.selected = iso2; update(); }
async function setLang(code) {
  state.lang = code || null;
  state.selected = null;
  if (state.lang) await need("gindex", "dialects");
  await setMode("languages");
  updatePoints();
}
function setMine(mine) { state.mine = mine; store.set("lt.mine", mine); renderControls(); update(); }
async function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-current", b.dataset.mode === mode));
  if (mode === "diversity") await need("glot");
  if (mode !== "languages") { points = []; drawPoints(); }
  renderControls();
  await update();
}

document.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
document.querySelectorAll("[data-proj]").forEach((b) => b.addEventListener("click", () => {
  state.proj = b.dataset.proj;
  document.querySelectorAll("[data-proj]").forEach((x) => x.setAttribute("aria-pressed", x === b));
  setupProjection();
}));

const yearIn = $("#year");
yearIn.min = L.YEAR0; yearIn.max = LAST; yearIn.value = LAST;
function showYear() {
  $("#yearOut").textContent = state.year;
  $("#yearNote").textContent = state.year >= PROJ ? "projected" : "";
  yearIn.style.setProperty("--fill", `${(100 * (state.year - L.YEAR0)) / (LAST - L.YEAR0)}%`);
}
yearIn.addEventListener("input", () => { state.year = +yearIn.value; showYear(); update(); });
let timer = null;
const playBtn = $("#play");
playBtn.addEventListener("click", () => {
  if (timer) { clearInterval(timer); timer = null; playBtn.innerHTML = icon("play"); playBtn.setAttribute("aria-label", "Play through the years"); return; }
  if (state.year >= LAST) yearIn.value = L.YEAR0;
  playBtn.innerHTML = icon("pause");
  playBtn.setAttribute("aria-label", "Pause");
  timer = setInterval(() => {
    if (+yearIn.value >= LAST) { playBtn.click(); return; }
    yearIn.value = +yearIn.value + 1;
    yearIn.dispatchEvent(new Event("input"));
  }, 160);
});

$("#aboutLink").addEventListener("click", () => {
  const wiki = Object.entries(meta.wikipedia).map(([code, w]) => `<li>${esc(lname(code))}: “${esc(w.title)}”, revision ${w.revid}, ${w.countries} countries</li>`).join("");
  $("#aboutBody").innerHTML = `<p>${esc(meta.method)}</p>
    <h3>Sources</h3><ul>${Object.values(meta.sources).map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
    <h3>Second-language figures from Wikipedia</h3><ul>${wiki}</ul>
    <p class="note">For each country the larger of the CLDR and Wikipedia figure is used. Wikipedia’s tables often count self-reported ability, so English totals run higher than Ethnologue’s (about 2.1 B against 1.5 B).</p>
    <h3>Labels</h3><p><span class="badge good">census</span> a census value for that year · <span class="badge warn">interpolated</span> between census years ·
    <span class="badge">wiki</span> second-language figure from Wikipedia. Unlabelled shares are a recent snapshot multiplied by that year's population, so they ignore language shift.
    Grey countries have no figure, which is not the same as zero.</p>
    <h3>Census series</h3><table class="t"><thead><tr><th>Country</th><th>Language</th><th>Metric</th><th>Source</th><th>Confidence</th></tr></thead><tbody>
    ${anchors.series.map((s) => `<tr><td>${esc(countries[s.country]?.name)}</td><td>${esc(lname(s.lang))}</td><td>${esc(s.metric)}</td><td>${esc(s.source)}</td><td>${esc(s.confidence)}</td></tr>`).join("")}</tbody></table>
    <p class="note">${esc(anchors._note)}</p><p class="note">Interface components adapted from Watermelon UI (MIT). Built ${esc(meta.built_at)}.</p>`;
  $("#about").showModal();
});

showYear();
setupProjection();
renderControls();
update();
