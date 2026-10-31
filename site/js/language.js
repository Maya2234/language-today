// Language page: language.html?l=<CLDR code> or ?l=g:<glottocode>
import * as L from "./logic.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const load = (f) => fetch(`data/${f}`).then((r) => r.json());

const param = new URLSearchParams(location.search).get("l") ?? "en";
const [world, countries, languages, anchors, meta, learn, gindex, dialects] = await Promise.all(
  ["countries-50m.json", "countries.json", "languages.json", "anchors.json", "meta.json", "learn.json", "glottolog_index.json", "dialects.json"].map(load));
const anchorIdx = L.indexAnchors(anchors);
const year = meta.years[1];

// Resolve the parameter to a language with speaker data (code) and/or a Glottolog entry (glottocode).
let code = param.startsWith("g:") ? null : param, glottocode = param.startsWith("g:") ? param.slice(2) : languages[param]?.glottocode;
if (!code && gindex[glottocode]?.[6]) code = gindex[glottocode][6];
const lang = languages[code], g = gindex[glottocode];
const name = lang?.name ?? g?.[0] ?? param;
document.title = `${name} · Language Today`;
const info = learn[code] ?? {};

const kpis = (items) => `<div class="kpis">${items.map(([label, value]) => `<div class="kpi"><span>${label}</span><b>${value}</b></div>`).join("")}</div>`;
const rows = (items, max, { name: n, val }) => `<ul class="rows">${items.map((d) => `<li class="row"><span class="name">${n(d)}</span><span class="val">${val(d)}</span>
  <span class="bar"><i style="width:${Math.max(0.5, (100 * d.v) / max)}%"></i></span></li>`).join("")}</ul>`;

const total = code ? L.languageTotal(countries, code, year, anchorIdx) : { speakers: 0, where: [] };
const where = total.where.filter((d) => d.speakers >= 1);
const glottoCountries = (g?.[5] ?? "").split(" ").filter((c) => countries[c]);
const dl = dialects[glottocode] ?? [];

const KINDS = { course: "Free courses", textbook: "Free textbooks", dictionary: "Dictionary and pronunciation", reference: "Reference" };
const res = info.resources ?? [];
const resHTML = res.length ? Object.entries(KINDS).map(([k, title]) => {
  const items = res.filter((r) => r.kind === k);
  return items.length ? `<h3>${title}</h3><ul class="reslist">${items.map((r) => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}<svg class="i"><use href="#i-ext"/></svg></a>${r.note ? `<span>${esc(r.note)}</span>` : ""}</li>`).join("")}</ul>` : "";
}).join("") : `<p class="note">No free course found for ${esc(name)} in the sources searched (Duolingo, Live Lingua Project, Language Transfer, Wikibooks).</p>`;

const h = info.hello;
const voices = () => ("speechSynthesis" in window ? speechSynthesis.getVoices() : []);
const voiceFor = () => code && voices().find((v) => v.lang.toLowerCase().startsWith(code.toLowerCase()));
const helloHTML = () => !h ? `<p class="note">Wiktionary lists no greeting for ${esc(name)} yet.</p>` : `<div class="hello big">
  <div><span class="hello-word">${esc(h.word)}</span>${h.translit ? `<span class="hello-tr">${esc(h.translit)}</span>` : ""}</div>
  <dl class="pron">
    ${h.translit ? `<div><dt>Say it like</dt><dd>${esc(h.translit)}</dd></div>` : ""}
    ${h.ipa ? `<div><dt>IPA</dt><dd>${esc(h.ipa)}</dd></div>` : ""}
  </dl>
  <div class="helloactions">${h.audio ? `<button class="btn" id="playRec"><svg class="i"><use href="#i-play"/></svg>Play recording</button>` : ""}
    <button class="btn ${h.audio ? "outline" : ""}" id="playTts" ${voiceFor() ? "" : "hidden"}><svg class="i"><use href="#i-play"/></svg>Browser voice</button></div>
  <p class="note">Word${h.ipa ? " and IPA" : ""} from <a href="${esc(h.source)}" target="_blank" rel="noopener">Wiktionary</a>${h.audio ? `; recording from <a href="https://commons.wikimedia.org/wiki/File:${encodeURIComponent(h.audio_file)}" target="_blank" rel="noopener">Wikimedia Commons</a> (free licence, see file page)` : ""}.
  ${h.audio ? "" : `<span id="ttsNote">${voiceFor() ? "No human recording yet; the browser voice is synthetic." : "No recording yet, and your browser has no voice for this language."}</span>`}</p></div>`;

$("#lang").innerHTML = `
  <section class="langhead">
    <h1>${esc(name)}</h1>
    <p class="sub">${esc([lang?.family ?? g?.[1], lang?.macroarea, (lang?.aes ?? g?.[4])?.replace(/_/g, " ")].filter(Boolean).join(" · "))}</p>
    ${kpis([[`Speakers, ${year}`, code ? L.formatCount(total.speakers) : "No estimate"], ["Countries", where.length || glottoCountries.length], ["Dialects", dl.length]])}
  </section>
  <div class="langgrid">
    <section class="card"><h2>How to say hello</h2>${helloHTML()}</section>
    <section class="card"><h2>Learn it for free</h2>${resHTML}<p class="note">Found by searching the course lists of Duolingo, Live Lingua Project, Language Transfer and Wikibooks, plus Wiktionary, Wikipedia and Glottolog. Links were checked when the data was built (${esc(meta.built_at.slice(0, 10))}).</p></section>
    <section class="card wide"><h2>Where it is spoken</h2><svg id="minimap" role="img" aria-label="Map of where ${esc(name)} is spoken"></svg>
      ${where.length ? rows(where.slice(0, 12).map((d) => ({ ...d, v: d.speakers })), where[0].speakers, { name: (d) => esc(countries[d.iso2].name), val: (d) => `<b>${L.formatCount(d.speakers)}</b> · ${L.formatPct(d.pct)}` })
        : glottoCountries.length ? `<p>${glottoCountries.map((c) => esc(countries[c].name)).join(", ")}</p><p class="note">Glottolog records where it is spoken but no speaker count.</p>` : ""}</section>
    ${dl.length ? `<section class="card wide"><h2>${dl.length} dialects</h2><p class="dialects">${dl.map((d) => esc(d[0])).join(" · ")}</p><p class="note">Dialect list from Glottolog.</p></section>` : ""}
  </div>`;

$("#playRec")?.addEventListener("click", () => new Audio(h.audio).play());
$("#playTts")?.addEventListener("click", () => {
  const u = new SpeechSynthesisUtterance(h.word);
  u.lang = code;
  u.voice = voiceFor() ?? null;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
});
if ("speechSynthesis" in window) speechSynthesis.addEventListener("voiceschanged", () => {  // voices load late in some browsers
  const b = $("#playTts");
  if (b) b.hidden = !voiceFor();
  const n = $("#ttsNote");
  if (n && voiceFor()) n.textContent = "No human recording yet; the browser voice is synthetic.";
});

// Mini map: share of population where we have shares, otherwise the countries Glottolog lists; red dot = Glottolog location.
const svg = d3.select("#minimap");
const feats = topojson.feature(world, world.objects.countries).features.filter((f) => f.id !== "010");
const byNum = new Map(Object.entries(countries).map(([iso2, c]) => [c.numeric, iso2]));
const share = new Map(where.map((d) => [d.iso2, d.pct]));
const listed = new Set(glottoCountries);
const color = d3.scaleSequentialSqrt([0, 100], d3.piecewise(d3.interpolateLab, ["#e3eefc", "#6fa3ec", "#1d5fbf", "#0a2a5e"]));
function drawMap() {
  const w = svg.node().getBoundingClientRect().width, h = Math.round(w * 0.5);
  svg.attr("viewBox", `0 0 ${w} ${h}`).attr("height", h);
  const proj = d3.geoEqualEarth().fitExtent([[4, 4], [w - 4, h - 4]], { type: "FeatureCollection", features: feats });
  const path = d3.geoPath(proj);
  svg.selectAll("path").data(feats).join("path").attr("d", path).attr("stroke", css("--land-stroke")).attr("stroke-width", 0.4)
    .attr("fill", (f) => { const iso2 = byNum.get(String(f.id)); return share.has(iso2) ? color(share.get(iso2)) : listed.has(iso2) ? css("--chart-3") : css("--nodata"); });
  const lat = lang?.lat ?? g?.[2], lon = lang?.lon ?? g?.[3];
  svg.selectAll("circle").data(lat != null ? [[lon, lat]] : []).join("circle").attr("class", "pt main").attr("r", 5)
    .attr("cx", (d) => proj(d)[0]).attr("cy", (d) => proj(d)[1]);
}
drawMap();
new ResizeObserver(drawMap).observe(svg.node());
