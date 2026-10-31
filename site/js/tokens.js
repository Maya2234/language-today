// Token dashboard: reads data/tokens.json (built by pipeline/tokens.py) and draws single-hue charts with D3.
import { tokenTotals, groupTokens, share, formatCount } from "./logic.js";

const data = await (await fetch("data/tokens.json")).json();
const $ = (id) => document.getElementById(id);
const tip = $("tooltip");
const full = (n) => Math.round(n).toLocaleString("en-US");
const time = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const stepLabel = Object.fromEntries(data.steps.map((s) => [s.id, s.label]));
const METRICS = { out: "Output", cr: "Cache read", calls: "Calls" };
const state = { session: data.sessions[0].id, metric: "out" };

function showTip(ev, html) {
  tip.innerHTML = html;
  tip.hidden = false;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  const x = Math.min(ev.pageX + 14, window.scrollX + innerWidth - w - 8);
  const y = ev.pageY + h + 20 > window.scrollY + innerHeight ? ev.pageY - h - 12 : ev.pageY + 14;
  tip.style.left = x + "px";
  tip.style.top = y + "px";
}
const hideTip = () => (tip.hidden = true);

function seg(el, options, current, onPick) {
  el.innerHTML = options.map(([v, label]) =>
    `<button type="button" data-v="${esc(v)}" aria-pressed="${v === current}">${esc(label)}</button>`).join("");
  el.onclick = (e) => {
    const b = e.target.closest("button");
    if (b) onPick(b.dataset.v);
  };
}

function table(el, head, rows) {
  el.innerHTML = `<table><thead><tr>${head.map((h, i) => `<th${i ? ' class="num"' : ""}>${h}</th>`).join("")}</tr></thead><tbody>${
    rows.map((r) => `<tr>${r.map((c, i) => `<td${i ? ' class="num"' : ""}>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

// Horizontal bars, one hue, 4px rounded data end, 2px gap between bars, label above each bar.
function hbars(el, rows, fmt, tipFor) {
  const width = el.clientWidth || 320, barH = 14, rowH = 38;
  const max = d3.max(rows, (r) => r.value) || 1;
  const x = d3.scaleLinear([0, max], [0, width - 64]);
  const svg = d3.select(el).html("").append("svg").attr("width", width).attr("height", rows.length * rowH).attr("class", "bars");
  const g = svg.selectAll("g").data(rows).join("g").attr("transform", (_, i) => `translate(0,${i * rowH})`);
  g.append("text").attr("class", "blabel").attr("y", 13).text((r) => r.label);
  const end = (r) => Math.max(x(r.value), 2);
  g.append("path").attr("class", "bar").attr("d", (r) => {
    const w = end(r), rr = Math.min(4, w / 2), y0 = 19;
    return `M0,${y0}H${w - rr}a${rr},${rr} 0 0 1 ${rr},${rr}V${y0 + barH - rr}a${rr},${rr} 0 0 1 -${rr},${rr}H0Z`;
  });
  g.append("text").attr("class", "bval").attr("x", (r) => end(r) + 6).attr("y", 31).text((r) => fmt(r.value));
  g.append("rect").attr("class", "hit").attr("width", width).attr("height", rowH)
    .on("mousemove", (ev, r) => showTip(ev, tipFor(r))).on("mouseleave", hideTip);
}

function lineChart(el, s) {
  const width = el.clientWidth || 600, height = 260, m = { t: 12, r: 12, b: 28, l: 52 };
  const calls = s.calls.map((c, i) => ({ ...c, i: i + 1 }));
  const x = d3.scaleLinear([1, Math.max(calls.length, 2)], [m.l, width - m.r]);
  const y = d3.scaleLinear([0, d3.max(calls, (c) => c.ctx) * 1.08], [height - m.b, m.t]).nice();
  const svg = d3.select(el).html("").append("svg").attr("width", width).attr("height", height).attr("class", "line");
  svg.append("g").attr("class", "grid").selectAll("line").data(y.ticks(4)).join("line")
    .attr("x1", m.l).attr("x2", width - m.r).attr("y1", y).attr("y2", y);
  svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l - 6},0)`)
    .call(d3.axisLeft(y).ticks(4).tickSize(0).tickFormat(formatCount)).call((a) => a.select(".domain").remove());
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - m.b + 6})`)
    .call(d3.axisBottom(x).ticks(Math.min(8, calls.length)).tickSize(0).tickFormat(d3.format("d"))).call((a) => a.select(".domain").remove());
  svg.append("text").attr("class", "axlabel").attr("x", width - m.r).attr("y", height - 2).attr("text-anchor", "end").text("model call #");
  const starts = [...new Map(calls.map((c) => [c.p, c])).values()];
  svg.append("g").attr("class", "marks").selectAll("line").data(starts).join("line")
    .attr("x1", (c) => x(c.i)).attr("x2", (c) => x(c.i)).attr("y1", m.t).attr("y2", height - m.b);
  let lastX = -Infinity; // label a boundary only if it is clear of the previous label
  const labelled = starts.filter((c) => (x(c.i) - lastX >= 24 ? ((lastX = x(c.i)), true) : false));
  svg.append("g").selectAll("text").data(labelled).join("text").attr("class", "plabel")
    .attr("x", (c) => x(c.i) + 3).attr("y", m.t + 10).text((c) => "P" + (c.p + 1));
  svg.append("path").datum(calls).attr("class", "ln").attr("d", d3.line((c) => x(c.i), (c) => y(c.ctx)));
  const cross = svg.append("line").attr("class", "cross").attr("y1", m.t).attr("y2", height - m.b).style("display", "none");
  const dot = svg.append("circle").attr("class", "dot").attr("r", 5).style("display", "none");
  svg.append("rect").attr("class", "hit").attr("x", m.l).attr("y", m.t).attr("width", width - m.l - m.r).attr("height", height - m.t - m.b)
    .on("mousemove", (ev) => {
      const c = calls[Math.max(0, Math.min(calls.length - 1, Math.round(x.invert(d3.pointer(ev)[0])) - 1))];
      cross.attr("x1", x(c.i)).attr("x2", x(c.i)).style("display", null);
      dot.attr("cx", x(c.i)).attr("cy", y(c.ctx)).style("display", null);
      showTip(ev, `<div class="tt-head"><span>Call ${c.i}</span><span>${time(c.t)}</span></div>
        <div class="tt-sub">P${c.p + 1}: ${esc(s.prompts[c.p].text)}</div>
        <div class="tt-row"><span>Context re-read</span><span class="tt-strong">${full(c.ctx)}</span></div>
        <div class="tt-row"><span>Output written</span><span>${full(c.out)}</span></div>
        <div class="tt-row"><span>Step</span><span>${stepLabel[c.step]}</span></div>`);
    })
    .on("mouseleave", () => { cross.style("display", "none"); dot.style("display", "none"); hideTip(); });
}

function renderSession() {
  const s = data.sessions.find((x) => x.id === state.session);
  const t = tokenTotals(s.calls);
  seg($("sessionSeg"), data.sessions.map((x) => [x.id, x.label]), state.session, (v) => { state.session = v; renderSession(); });
  const mins = Math.round((new Date(s.end) - new Date(s.start)) / 60000);
  $("sessionNote").textContent = `${time(s.start)}–${time(s.end)} (${Math.floor(mins / 60)} h ${mins % 60} m), ${s.prompts.length} prompts, ${s.models.join(", ")}`;
  const kpi = (label, v, title) => `<div class="kpi" title="${esc(title)}"><span>${label}</span><b>${v}</b></div>`;
  $("kpis").innerHTML = [
    kpi("Tokens processed", formatCount(t.processed), full(t.processed)),
    kpi("Output written", formatCount(t.out), full(t.out)),
    kpi("Cache reads", Math.round(share(t.cr, t.processed)) + "%", `${full(t.cr)} of ${full(t.processed)}`),
    kpi("Model calls", full(t.calls), ""),
    kpi("Peak context", formatCount(t.peak_ctx), full(t.peak_ctx)),
  ].join("");

  lineChart($("ctxChart"), s);
  table($("ctxTable"), ["Call", "Time", "Prompt", "Step", "Context", "Output"],
    s.calls.map((c, i) => [i + 1, time(c.t), "P" + (c.p + 1), stepLabel[c.step], full(c.ctx), full(c.out)]));

  renderSteps(s, t);

  const prompts = groupTokens(s.calls, "p").map((g) => ({ ...g, label: `P${g.key + 1} · ${s.prompts[g.key].text}` }));
  hbars($("promptChart"), prompts.map((g) => ({ ...g, value: g.processed })), formatCount, (g) =>
    `<div class="tt-head"><span>P${g.key + 1}</span><span>${time(s.prompts[g.key].t)}</span></div><div class="tt-sub">${esc(s.prompts[g.key].text)}</div>
     <div class="tt-row"><span>Processed</span><span class="tt-strong">${full(g.processed)}</span></div>
     <div class="tt-row"><span>Output</span><span>${full(g.out)}</span></div>
     <div class="tt-row"><span>Calls</span><span>${g.calls}</span></div>
     <div class="tt-row"><span>Context at end</span><span>${full(g.peak_ctx)}</span></div>`);
  table($("promptTable"), ["Prompt", "Calls", "Output", "Cache read", "Processed", "Peak context"],
    prompts.map((g) => [esc(g.label), g.calls, full(g.out), full(g.cr), full(g.processed), full(g.peak_ctx)]));
}

function renderSteps(s, t) {
  seg($("metricSeg"), Object.entries(METRICS), state.metric, (v) => { state.metric = v; renderSteps(s, t); });
  const m = state.metric;
  const rows = groupTokens(s.calls, "step").map((g) => ({ ...g, label: stepLabel[g.key], value: g[m] }))
    .sort((a, b) => b.value - a.value);
  hbars($("stepChart"), rows, (v) => (m === "calls" ? v : formatCount(v)) + ` · ${Math.round(share(v, t[m]))}%`, (g) =>
    `<div class="tt-head"><span>${g.label}</span></div>
     <div class="tt-row"><span>Output</span><span>${full(g.out)}</span></div>
     <div class="tt-row"><span>Cache read</span><span>${full(g.cr)}</span></div>
     <div class="tt-row"><span>Calls</span><span>${g.calls}</span></div>
     <div class="tt-row"><span>Output per call</span><span>${full(g.out / g.calls)}</span></div>`);
  table($("stepTable"), ["Step", "Calls", "Output", "Cache read", "Share of output"],
    rows.map((g) => [g.label, g.calls, full(g.out), full(g.cr), Math.round(share(g.out, t.out)) + "%"]));
}

function renderStatic() {
  const overhead = Object.values(data.overhead).reduce((a, b) => a + b, 0);
  const build = data.sessions[0], fresh = data.sessions[1];
  const lastBuild = build.calls[build.calls.length - 1];
  const practice = [
    { label: "Fixed overhead (any session, before work)", value: overhead },
    fresh && { label: `First call, fresh session (${fresh.label})`, value: fresh.calls[0].ctx },
    { label: `First call, ${build.label.toLowerCase()}`, value: build.calls[0].ctx },
    { label: `Last call, ${build.label.toLowerCase()} (no /clear)`, value: lastBuild.ctx },
  ].filter(Boolean);
  if (fresh) $("practiceNote").textContent = `Tokens re-read by a single call. The last call of the build session re-read ${
    Math.round(lastBuild.ctx / fresh.calls[0].ctx)}× more than the first call of a fresh session, even for a one-line answer.`;
  hbars($("practiceChart"), practice, formatCount, (r) => `<div class="tt-head"><span>${esc(r.label)}</span></div>
    <div class="tt-row"><span>Context re-read</span><span class="tt-strong">${full(r.value)}</span></div>`);
  const names = { system_tools: "Built-in tool definitions", mcp_tools: "MCP connector tools", system_prompt: "System prompt",
    skills: "Skills list", memory: "Memory + CLAUDE.md" };
  const oh = Object.entries(data.overhead).map(([k, v]) => ({ label: names[k] || k, value: v })).sort((a, b) => b.value - a.value);
  hbars($("overheadChart"), oh, formatCount, (r) => `<div class="tt-head"><span>${esc(r.label)}</span></div>
    <div class="tt-row"><span>Tokens</span><span class="tt-strong">${full(r.value)}</span></div>
    <div class="tt-row"><span>Share of overhead</span><span>${Math.round(share(r.value, overhead))}%</span></div>`);
  table($("planBox"), ["Snapshot", "5-hour window", "Weekly", "Context"],
    data.snapshots.map((x) => [new Date(x.timestamp).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }),
      x.plan_5h_percent + "%", x.plan_weekly_percent + "%", esc(x.practice)]));
  $("method").textContent = `Source: ${data.source}. Method: ${data.method} Plan: ${data.plan}. Generated ${data.generated}.`;
}

renderStatic();
renderSession();
let resizeTimer;
addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { renderStatic(); renderSession(); }, 150); });
