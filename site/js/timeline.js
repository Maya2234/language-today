// Timeline and contributions: reads data/timeline.json (built by pipeline/report.py).
import { matchesQuery, countBy, dayOf } from "./logic.js";

const data = await (await fetch("data/timeline.json")).json();
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const clock = (iso) => iso.slice(11, 16) + " " + (iso.slice(19) === "Z" ? "UTC" : iso.slice(19));
const dayLabel = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const shortDay = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
const WHO ={ user: "Maya", claude: "Claude" };
const KIND = { prompt: "Prompt", progress: "Progress", commit: "Commit", "test-run": "Test run", "human-review": "Review",
  "browser-check": "Browser check", "test-change": "Test change", "bug-fix": "Bug fix", decision: "Decision", correction: "Log correction" };
const events = data.events;
const state = { q: "", actor: "all", kind: "all", order: "new" };

function seg(el, options, key) {
  el.innerHTML = options.map(([v, label]) => `<button type="button" data-v="${v}" aria-pressed="${v === state[key]}">${label}</button>`).join("");
  el.onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    state[key] = b.dataset.v;
    seg(el, options, key);
    renderTimeline();
  };
}

function renderSummary() {
  const n = (actor, kinds) => events.filter((e) => e.actor === actor && (!kinds || kinds.includes(e.kind))).length;
  const days = countBy(events, (e) => dayOf(e.t));
  const kpi = (label, v, sub = "") => `<div class="kpi"><span>${label}</span><b>${v}</b>${sub ? `<small>${sub}</small>` : ""}</div>`;
  $("kpis").innerHTML = [
    kpi("Days worked", days.length, `${shortDay(days[0][0])} – ${shortDay(days.at(-1)[0])}, ${days.at(-1)[0].slice(0, 4)}`),
    kpi("Prompts by Maya", n("user", ["prompt"])),
    kpi("Reviews & decisions by Maya", n("user", ["human-review", "decision"])),
    kpi("Progress entries by Claude", n("claude", ["progress"])),
    kpi("Commits", events.filter((e) => e.kind === "commit").length, `${events.filter((e) => e.kind === "test-run").length} test runs`),
  ].join("");

  const perDay = days.map(([d]) => ({ d, user: 0, claude: 0 }));
  for (const e of events) perDay.find((x) => x.d === dayOf(e.t))[e.actor]++;
  const max = Math.max(...perDay.flatMap((x) => [x.user, x.claude]));
  $("days").innerHTML = perDay.map((x) => `<div class="dayrow"><span class="dlabel">${dayLabel(x.d)}</span>
      ${["user", "claude"].map((a) => `<div class="dbar"><i class="${a}" style="width:${(100 * x[a]) / max}%"></i><span>${x[a]} ${WHO[a]}</span></div>`).join("")}
    </div>`).join("");

  const list = (actor) => countBy(events.filter((e) => e.actor === actor), (e) => e.kind)
    .map(([k, c]) => `<li><span>${KIND[k] ?? k}</span><b>${c}</b></li>`).join("");
  $("roles").innerHTML = `<div class="roles">
    <div><h3><span class="who user">Maya</span></h3><p class="note">Product owner and supervisor: chose the topic and features, reviewed results, caught errors the tests missed, made the naming and account decisions. Wrote no code directly.</p><ul class="kv">${list("user")}</ul></div>
    <div><h3><span class="who claude">Claude</span></h3><p class="note">Implementer: specs, data pipeline, app, tests, docs and deployment; asked before account actions and political naming.</p><ul class="kv">${list("claude")}</ul></div></div>`;
}

function renderTimeline() {
  let rows = events.filter((e) => (state.actor === "all" || e.actor === state.actor) && (state.kind === "all" || e.kind === state.kind)
    && matchesQuery(e, state.q, ["title", "detail", "phase", "ref"]));
  if (state.order === "new") rows = rows.slice().reverse();
  $("count").textContent = `${rows.length} of ${events.length} events`;
  let html = "", day = null;
  for (const e of rows) {
    const d = dayOf(e.t);
    if (d !== day) { html += `${day ? "</ol>" : ""}<h3 class="dayhead">${dayLabel(d)}</h3><ol class="tl">`; day = d; }
    const title = e.kind === "prompt" ? `“${esc(e.title)}”` : esc(e.title);
    const detail = e.detail ? (e.kind === "prompt" ? `<p><b>Claude’s response:</b> ${esc(e.detail)}</p>` : `<p class="pre">${esc(e.detail)}</p>`) : "";
    const ref = e.kind === "commit" ? `<a href="https://github.com/Maya2234/language-today/commit/${esc(e.ref)}" target="_blank" rel="noopener"><code>${esc(e.ref)}</code></a>` : `<code>${esc(e.ref)}</code>`;
    html += `<li class="ev ${e.actor}">
      <div class="evmeta"><time datetime="${esc(e.t)}">${clock(e.t)}</time><span class="who ${e.actor}">${WHO[e.actor]}</span>
        <span class="badge">${KIND[e.kind] ?? esc(e.kind)}</span>${e.phase ? `<span class="badge blue">${esc(e.phase)}</span>` : ""}
        ${e.corrected ? `<span class="badge warn" title="Time fixed by a later correction entry">time corrected</span>` : ""}</div>
      ${detail ? `<details><summary class="evtitle">${title}</summary>${detail}<p class="note">Source: ${ref}</p></details>`
        : `<p class="evtitle">${title}</p><p class="note">Source: ${ref}</p>`}</li>`;
  }
  $("timeline").innerHTML = html ? html + "</ol>" : `<p class="note">No events match these filters.</p>`;
}

seg($("actorSeg"), [["all", "All"], ["user", "Maya"], ["claude", "Claude"]], "actor");
seg($("orderSeg"), [["new", "Newest first"], ["old", "Oldest first"]], "order");
$("kind").innerHTML = `<option value="all">All events</option>` +
  countBy(events, (e) => e.kind).map(([k, c]) => `<option value="${k}">${KIND[k] ?? k} (${c})</option>`).join("");
$("kind").addEventListener("change", (e) => { state.kind = e.target.value; renderTimeline(); });
$("q").addEventListener("input", (e) => { state.q = e.target.value; renderTimeline(); });
$("method").textContent = `Source: ${data.source}. Method: ${data.method} Generated ${data.generated}.`;
renderSummary();
renderTimeline();
