"""Build site/data/tokens.json from the Claude Code session transcripts of this project.

Usage: python pipeline/tokens.py [--transcripts DIR]
Default DIR: ~/.claude/projects/<slug of the repo path>/
Token counts are measured (the `usage` block of each API response, one per message id);
the project step of each call is estimated from the tools it used (STEP_RULES below).
"""
import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data" / "tokens.json"
LOG = ROOT / "docs" / "log" / "tokens.jsonl"

# Sessions in the project folder that are not about this project.
EXCLUDE = {"a1c409d7-4c47-42c0-9588-0e6c9a138246": "README formatting for a different course project"}
LABELS = {"f745ad3e-09ca-4356-a994-59930afb6e46": "Build session",
          "6604a318-f00f-4df0-a287-b9c7592ba73b": "Docs + dashboard session"}

# First matching rule wins; matched against "ToolName <json input>" of every tool call in the message.
STEP_RULES = [
    ("validation-tests", r"run_tests|unittest|node --test"),
    ("validation-browser", r"Claude_Browser"),
    ("gathering-data", r"fetch\.py|scrape|curl |wikipedia\.py|Invoke-WebRequest|urllib|download"),
    ("processing-data", r"build\.py|regions\.py|tokens\.py|python "),
    ("writing-code", r"^(Write|Edit) |\n(Write|Edit) "),
    ("git-publish", r"git |gh |winget"),
    ("reading", r"^(Read|Grep|Glob) |\n(Read|Grep|Glob) |cat |ls |head |sed -n"),
]
STEPS = [s for s, _ in STEP_RULES] + ["planning-talk"]
STEP_LABELS = {"validation-tests": "Validation: tests", "validation-browser": "Validation: browser",
               "gathering-data": "Gathering data", "processing-data": "Processing data",
               "writing-code": "Writing code & docs", "git-publish": "Git & publishing",
               "reading": "Reading & exploring", "planning-talk": "Planning & talk"}


def classify(tool_lines):
    text = "\n".join(tool_lines)
    for step, pattern in STEP_RULES:
        if re.search(pattern, text):
            return step
    return "planning-talk"


def prompt_label(text):
    text = re.sub(r"<pasted_content[^>]*>.*?</pasted_content[^>]*>", " [pasted text] ", text, flags=re.S)
    if text.startswith("Your response above was cut off"):
        return "(resume after a cut-off response)"
    text = " ".join(text.split())
    return text if len(text) <= 90 else text[:87].rstrip() + "…"


def is_prompt(rec):
    msg = rec.get("message") or {}
    content = msg.get("content")
    return rec.get("type") == "user" and isinstance(content, str) and not content.startswith("<")


def parse_session(path):
    calls, prompts, by_id = [], [], {}
    for line in path.open(encoding="utf-8"):
        try:
            rec = json.loads(line)
        except ValueError:
            continue
        if is_prompt(rec):
            prompts.append({"t": rec["timestamp"], "text": prompt_label(rec["message"]["content"])})
            continue
        if rec.get("type") != "assistant" or not prompts:
            continue
        msg = rec.get("message") or {}
        tools = [f"{c['name']} {json.dumps(c.get('input', {}))[:400]}"
                 for c in msg.get("content") or [] if isinstance(c, dict) and c.get("type") == "tool_use"]
        mid = msg.get("id")
        if mid in by_id:  # one API response is split over several transcript lines
            by_id[mid]["tools"] += tools
            continue
        u = msg.get("usage") or {}
        call = {"t": rec["timestamp"], "p": len(prompts) - 1, "in": u.get("input_tokens", 0),
                "out": u.get("output_tokens", 0), "cw": u.get("cache_creation_input_tokens", 0),
                "cr": u.get("cache_read_input_tokens", 0), "tools": tools, "model": msg.get("model")}
        by_id[mid] = call
        calls.append(call)
    models = sorted({c.pop("model") for c in calls if c.get("model")})
    for c in calls:
        c["step"] = classify(c.pop("tools"))
        c["ctx"] = c["in"] + c["cw"] + c["cr"]
    totals = {k: sum(c[k] for c in calls) for k in ("in", "out", "cw", "cr")}
    totals.update(calls=len(calls), peak_ctx=max((c["ctx"] for c in calls), default=0))
    return {"id": path.stem, "label": LABELS.get(path.stem, path.stem[:8]), "models": models,
            "start": calls[0]["t"] if calls else None, "end": calls[-1]["t"] if calls else None,
            "totals": totals, "prompts": prompts, "calls": calls}


def main():
    slug = re.sub(r"[^A-Za-z0-9]", "-", str(ROOT))
    ap = argparse.ArgumentParser()
    ap.add_argument("--transcripts", default=str(Path.home() / ".claude" / "projects" / slug))
    args = ap.parse_args()
    sessions = [parse_session(p) for p in sorted(Path(args.transcripts).glob("*.jsonl")) if p.stem not in EXCLUDE]
    sessions = sorted((s for s in sessions if s["calls"]), key=lambda s: s["start"])
    snapshots = [json.loads(l) for l in LOG.open(encoding="utf-8") if l.strip()]
    overhead = next((s["breakdown"] for s in reversed(snapshots) if "system_tools" in s.get("breakdown", {})), {})
    data = {
        "source": "Claude Code session transcripts (usage block of every API response); docs/log/tokens.jsonl "
                  "(Claude desktop get_usage snapshots)",
        "method": "Token counts measured, one record per API message id. Step per call estimated from the tools it "
                  "called (first matching rule in pipeline/tokens.py STEP_RULES). Context = input + cache write + "
                  "cache read.",
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "plan": "Claude Pro ($20/month), Claude Code desktop, 1M-token context window",
        "excluded": [{"id": k, "reason": v} for k, v in EXCLUDE.items()],
        "steps": [{"id": s, "label": STEP_LABELS[s]} for s in STEPS],
        "overhead": {k: v for k, v in overhead.items() if k != "messages"},
        "snapshots": [{k: s[k] for k in ("timestamp", "plan_5h_percent", "plan_weekly_percent", "practice")
                       if k in s} for s in snapshots if "plan_5h_percent" in s],
        "sessions": sessions,
    }
    OUT.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    for s in sessions:
        print(f"{s['label']}: {s['totals']['calls']} calls, out {s['totals']['out']:,}, "
              f"cache read {s['totals']['cr']:,}, peak ctx {s['totals']['peak_ctx']:,}")


if __name__ == "__main__":
    main()
