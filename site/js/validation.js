// Validation report: reads data/validation.json (built by pipeline/report.py).
import { matchesQuery, countBy } from "./logic.js";

const data = await (await fetch("data/validation.json")).json();
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const when = (iso) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const icon = (n) => `<svg class="i"><use href="#i-${n}"/></svg>`;
const runs = data.runs, last = runs.length - 1;
const state = { q: "", suite: "all", status: "all", area: "all", run: last, actor: "all" };

function seg(el, options, key, onPick) {
  el.innerHTML = options.map(([v, label]) =>
    `<button type="button" data-v="${esc(v)}" aria-pressed="${String(v) === String(state[key])}">${esc(label)}</button>`).join("");
  el.onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    state[key] = b.dataset.v;
    seg(el, options, key, onPick);
    onPick();
  };
}

const statusBadge = (s) => s == null ? `<span class="badge">not run</span>`
  : s === "pass" ? `<span class="badge good">${icon("check")}pass</span>` : `<span class="badge bad">${icon("x")}${esc(s)}</span>`;

function renderKpis() {
  const r = runs[last];
  const failedEver = data.tests.filter((t) => t.history.some((s) => s && s !== "pass")).length;
  const byUser = data.reviews.filter((x) => x.actor === "user").length;
  const kpi = (label, v, sub = "") => `<div class="kpi"><span>${label}</span><b>${v}</b>${sub ? `<small>${sub}</small>` : ""}</div>`;
  $("kpis").innerHTML = [
    kpi("Latest run", `${r.pass}/${r.pass + r.fail}`, r.fail ? `${r.fail} failing` : "all passing"),
    kpi("Tests", data.tests.length, countBy(data.tests, (t) => t.suite).map(([k, n]) => `${n} ${k === "js" ? "JS" : "Python"}`).join(" · ")),
    kpi("Runs logged", runs.length, `${when(runs[0].timestamp)} – ${when(r.timestamp)}`),
    kpi("Tests that ever failed", failedEver, "see history dots"),
    kpi("Review entries", data.reviews.length, `${byUser} by Maya`),
  ].join("");
}

function renderRuns() {
  const max = Math.max(...runs.map((r) => r.pass + r.fail));
  $("runs").innerHTML = runs.map((r, i) => `<button type="button" class="run" data-i="${i}" aria-pressed="${i === state.run}"
      title="${esc(r.phase)}: ${r.pass} passed, ${r.fail} failed">
      <span class="runbar" style="height:${(100 * (r.pass + r.fail)) / max}%">${r.fail ? `<i style="height:${(100 * r.fail) / (r.pass + r.fail)}%"></i>` : ""}</span>
      <b>${r.pass}/${r.pass + r.fail}</b><span>${esc(r.phase)}</span><span>${when(r.timestamp)}</span></button>`).join("");
  $("runs").onclick = (e) => {
    const b = e.target.closest(".run");
    if (!b) return;
    state.run = +b.dataset.i;
    renderRuns();
    renderTests();
  };
  const r = runs[state.run];
  $("runNote").textContent = `Showing run ${r.id} (${r.phase})${r.fail ? ` · ${r.fail} failed` : ""}`;
}

function renderTests() {
  const rows = data.tests.filter((t) => {
    const s = t.history[state.run];
    return (state.suite === "all" || t.suite === state.suite)
      && (state.area === "all" || t.area === state.area)
      && (state.status === "all" || (state.status === "pass" ? s === "pass" : state.status === "fail" ? s && s !== "pass" : s == null))
      && matchesQuery(t, state.q, ["id", "checks", "area", "context", "code"]);
  });
  $("testCount").textContent = `${rows.length} of ${data.tests.length}`;
  $("tests").innerHTML = rows.length ? rows.map((t) => {
    const s = t.history[state.run];
    const dots = t.history.map((h, i) => `<i class="hdot ${h == null ? "none" : h === "pass" ? "ok" : "bad"}${i === state.run ? " cur" : ""}"
      title="${esc(runs[i].id)}: ${h ?? "not run"}"></i>`).join("");
    const msg = t.history.map((h, i) => (h && h !== "pass" ? `${runs[i].id}` : null)).filter(Boolean);
    return `<details class="test"><summary>
        ${statusBadge(s)}<span class="tname">${esc(t.checks)}</span><span class="tarea">${esc(t.area)}</span>
        <span class="hdots" aria-label="History across ${runs.length} runs">${dots}</span></summary>
      <div class="tbody">
        <p class="note"><code>${esc(t.id)}</code> · ${t.suite === "js" ? "JavaScript (node --test)" : "Python (unittest)"}
          ${t.latest ? ` · ${t.latest.duration_ms} ms in latest run` : ""}</p>
        ${t.context ? `<p class="note">${esc(t.context)}</p>` : ""}
        ${msg.length ? `<p class="note warnline">Failed in run ${msg.join(", ")}. See the review log for what changed.</p>` : ""}
        <pre class="code">${esc(t.code)}</pre>
        <a class="btn outline" href="${esc(t.url)}" target="_blank" rel="noopener">${icon("ext")}${esc(t.file)}:${t.line} on GitHub</a>
      </div></details>`;
  }).join("") : `<p class="note">No tests match these filters.</p>`;
}

function renderReviews() {
  const rows = data.reviews.filter((r) => state.actor === "all" || r.actor === state.actor).slice().reverse();
  const kindLabel = { "human-review": "Human review", "browser-check": "Browser check", "test-change": "Test expectation changed",
    "bug-fix": "Bug fixed", decision: "Decision" };
  $("reviews").innerHTML = rows.map((r) => `<article class="review">
      <div class="rhead"><span class="who ${r.actor}">${r.actor === "user" ? "Maya" : "Claude"}</span>
        <span class="badge">${esc(kindLabel[r.kind] ?? r.kind)}</span><span class="note">${when(r.timestamp)}</span></div>
      <h3>${esc(r.summary)}</h3>
      <dl><dt>Found</dt><dd>${esc(r.finding)}</dd><dt>Outcome</dt><dd>${esc(r.outcome)}</dd>
      ${r.tests?.length ? `<dt>Tests</dt><dd>${r.tests.map((t) => `<button type="button" class="linkish" data-test="${esc(t)}">${esc(t)}</button>`).join(", ")}</dd>` : ""}
      <dt>Source</dt><dd><code>${esc(r.source)}</code></dd></dl></article>`).join("");
  $("reviews").onclick = (e) => {
    const b = e.target.closest("[data-test]");
    if (!b) return;
    Object.assign(state, { q: b.dataset.test, suite: "all", status: "all", area: "all", run: last });
    $("q").value = b.dataset.test;
    setupFilters();
    renderRuns();
    renderTests();
    $("tests").querySelector("details")?.setAttribute("open", "");
    $("q").scrollIntoView({ behavior: "smooth", block: "center" });
  };
}

function setupFilters() {
  seg($("suiteSeg"), [["all", "All"], ["python", "Python"], ["js", "JS"]], "suite", renderTests);
  seg($("statusSeg"), [["all", "Any"], ["pass", "Pass"], ["fail", "Fail"], ["none", "Not run"]], "status", renderTests);
  seg($("actorSeg"), [["all", "All"], ["user", "Maya"], ["claude", "Claude"]], "actor", renderReviews);
  const areas = countBy(data.tests, (t) => t.area);
  $("area").innerHTML = `<option value="all">All areas</option>` + areas.map(([a, n]) => `<option value="${esc(a)}">${esc(a)} (${n})</option>`).join("");
  $("area").value = state.area;
}

$("q").addEventListener("input", (e) => { state.q = e.target.value; renderTests(); });
$("area").addEventListener("change", (e) => { state.area = e.target.value; renderTests(); });
$("repro").textContent = data.reproduce.join("\n");
$("method").textContent = `Source: ${data.source}. Method: ${data.method} Generated ${data.generated}.`;
setupFilters();
renderKpis();
renderRuns();
renderTests();
renderReviews();
