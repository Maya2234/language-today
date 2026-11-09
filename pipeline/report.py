"""Build site/data/validation.json and site/data/timeline.json from the project logs, test sources and git history.

Usage: python pipeline/report.py
Inputs: docs/log/{tests,reviews,progress,prompts}.jsonl, tests/test_data.py, tests/js/*.test.mjs, `git log`.
"""
import ast
import json
import re
import subprocess
import textwrap
from collections import OrderedDict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOG = ROOT / "docs" / "log"
OUT = ROOT / "site" / "data"
REPO = "https://github.com/Maya2234/language-today/blob/main/"


def jsonl(name):
    path = LOG / name
    return [json.loads(l) for l in path.open(encoding="utf-8") if l.strip()] if path.exists() else []


def utc(ts):
    return datetime.fromisoformat(ts).astimezone(timezone.utc)


def humanize(name):
    words = name.removeprefix("test_").replace("_", " ")
    return words[:1].upper() + words[1:]


def python_tests():
    path = ROOT / "tests" / "test_data.py"
    src = path.read_text(encoding="utf-8")
    out = []
    for cls in ast.parse(src).body:
        if not (isinstance(cls, ast.ClassDef) and cls.name.startswith("Test")):
            continue
        area = re.sub(r"(?<!^)(?=[A-Z])", " ", cls.name.removeprefix("Test"))
        for fn in cls.body:
            if isinstance(fn, ast.FunctionDef) and fn.name.startswith("test_"):
                out.append({"id": f"{cls.name}.{fn.name}", "suite": "python", "area": area,
                            "checks": ast.get_docstring(fn) or humanize(fn.name), "context": ast.get_docstring(cls),
                            "file": "tests/test_data.py", "line": fn.lineno,
                            "code": textwrap.dedent("    " + ast.get_source_segment(src, fn))})
    return out


def js_tests():
    out = []
    for path in sorted((ROOT / "tests" / "js").glob("*.test.mjs")):
        lines = path.read_text(encoding="utf-8").splitlines()
        rel = path.relative_to(ROOT).as_posix()
        for i, line in enumerate(lines):
            m = re.match(r'test\("(.+?)",', line)
            if not m:
                continue
            end = next((j for j in range(i + 1, len(lines)) if lines[j].startswith("});")), i)
            out.append({"id": m.group(1), "suite": "js", "area": "App logic", "checks": m.group(1)[:1].upper() + m.group(1)[1:],
                        "context": None, "file": rel, "line": i + 1, "code": "\n".join(lines[i:end + 1])})
    return out


def validation():
    results = jsonl("tests.jsonl")
    runs = OrderedDict()
    for r in results:
        run = runs.setdefault(r["run_id"], {"id": r["run_id"], "timestamp": r["timestamp"], "phase": r["phase"],
                                             "pass": 0, "fail": 0, "duration_ms": 0.0})
        run["pass" if r["status"] == "pass" else "fail"] += 1
        run["duration_ms"] = round(run["duration_ms"] + r["duration_ms"], 1)
    run_ids = list(runs)
    by_test = {}
    for r in results:
        by_test.setdefault(r["test"], {})[r["run_id"]] = r
    tests = python_tests() + js_tests()
    known = {t["id"] for t in tests}
    for t in tests:
        hist = by_test.get(t["id"], {})
        t["history"] = [hist[rid]["status"] if rid in hist else None for rid in run_ids]
        last = next((hist[rid] for rid in reversed(run_ids) if rid in hist), None)
        t["latest"] = {"status": last["status"], "duration_ms": last["duration_ms"], "message": last["message"]} if last else None
        t["url"] = f"{REPO}{t['file']}#L{t['line']}"
    removed = [{"id": k, "suite": next(iter(v.values()))["suite"], "history": [v[rid]["status"] if rid in v else None for rid in run_ids]}
               for k, v in by_test.items() if k not in known]
    return {
        "source": "docs/log/tests.jsonl (written by pipeline/run_tests.py on every run); test source from tests/; "
                  "docs/log/reviews.jsonl (review and evidence log)",
        "method": "Test results are measured. Each test's description is its docstring or its name; code is extracted "
                  "from the test file. Review entries are recorded by Claude from the session and cite the log line "
                  "they come from.",
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "reproduce": ["python pipeline/fetch.py", "python pipeline/build.py", "python pipeline/run_tests.py --phase <name>",
                      "python -m unittest discover tests", "node --test tests/js"],
        "runs": list(runs.values()),
        "tests": tests,
        "removed": removed,
        "reviews": jsonl("reviews.jsonl"),
    }


def git_commits():
    out = subprocess.run(["git", "log", "--format=%h%x1f%aI%x1f%s%x1f%b%x1e"], cwd=ROOT, capture_output=True,
                         text=True, encoding="utf-8").stdout
    commits = []
    for rec in filter(str.strip, out.split("\x1e")):
        h, t, subject, body = rec.strip("\n").split("\x1f")
        body = "\n".join(l for l in body.splitlines() if not l.startswith("Co-Authored-By")).strip()
        commits.append({"hash": h, "timestamp": t, "subject": subject, "body": body})
    return commits


def timeline():
    progress, prompts = jsonl("progress.jsonl"), jsonl("prompts.jsonl")
    fixes = {(c["log"], c["corrects_timestamp"]): c["timestamp_actual"] for c in progress if c.get("kind") == "correction"}
    events = []

    def add(t, actor, kind, title, detail="", ref="", phase="", corrected=False):
        events.append({"t": t, "actor": actor, "kind": kind, "title": title, "detail": detail, "ref": ref,
                       "phase": phase, "corrected": corrected})

    for p in prompts:
        t = fixes.get(("prompts.jsonl", p["timestamp"]), p["timestamp"])
        add(t, "user", "prompt", p["prompt"], p.get("response_summary", ""), "docs/log/prompts.jsonl", corrected=t != p["timestamp"])
    for p in progress:
        if p.get("kind") == "correction":
            add(p["timestamp"], "claude", "correction", p["summary"], f"{p['log']}: {p['corrects_timestamp']} → {p['timestamp_actual']}",
                "docs/log/progress.jsonl")
            continue
        t = fixes.get(("progress.jsonl", p["timestamp"]), p["timestamp"])
        add(t, p.get("actor", "claude"), "progress", p["summary"], "", "docs/log/progress.jsonl", p.get("phase", ""), t != p["timestamp"])
    for c in git_commits():
        add(c["timestamp"], "claude", "commit", c["subject"], c["body"], c["hash"])
    for r in validation_runs():
        add(r["timestamp"], "claude", "test-run", f"Test run {r['id']}: {r['pass']}/{r['pass'] + r['fail']} passed",
            f"Phase: {r['phase']}", "docs/log/tests.jsonl", r["phase"])
    for r in jsonl("reviews.jsonl"):
        add(r["timestamp"], r["actor"], r["kind"], r["summary"], f"Found: {r['finding']}\nOutcome: {r['outcome']}", r["source"])
    events.sort(key=lambda e: utc(e["t"]))
    for i, e in enumerate(events):
        e["id"] = i
    return {
        "source": "docs/log/prompts.jsonl, docs/log/progress.jsonl, docs/log/reviews.jsonl, docs/log/tests.jsonl, git log",
        "method": "Every log line and commit is one event, sorted by UTC time. Prompts are Maya's (actor user); "
                  "progress entries, commits and test runs are Claude's. Commits are authored as Maya Tomarchio because "
                  "they were made in her repository; Claude wrote their content. Timestamps fixed by a later "
                  "'correction' entry are marked corrected; the logs themselves stay append-only.",
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "events": events,
    }


def validation_runs():
    return validation()["runs"]


def main():
    v, t = validation(), timeline()
    (OUT / "validation.json").write_text(json.dumps(v, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    (OUT / "timeline.json").write_text(json.dumps(t, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(f"validation: {len(v['runs'])} runs, {len(v['tests'])} tests, {len(v['removed'])} removed, {len(v['reviews'])} reviews")
    print(f"timeline: {len(t['events'])} events")


if __name__ == "__main__":
    main()
