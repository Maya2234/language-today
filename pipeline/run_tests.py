"""Run both test suites and append one JSON line per test to docs/log/tests.jsonl.

Usage: python pipeline/run_tests.py [--phase NAME]
Each line: {run_id, timestamp, phase, suite, test, status, duration_ms, message}
"""
import json
import subprocess
import sys
import time
import unittest
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOG = ROOT / "docs" / "log" / "tests.jsonl"


class Collect(unittest.TextTestResult):
    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        self.records, self._t = [], 0.0

    def startTest(self, test):
        self._t = time.perf_counter()
        super().startTest(test)

    def _rec(self, test, status, message=""):
        self.records.append({"suite": "python", "test": test.id().replace("test_data.", ""), "status": status,
                             "duration_ms": round((time.perf_counter() - self._t) * 1000, 1), "message": message})

    def addSuccess(self, test):
        super().addSuccess(test)
        self._rec(test, "pass")

    def addFailure(self, test, err):
        super().addFailure(test, err)
        self._rec(test, "fail", self._exc_info_to_string(err, test).strip().splitlines()[-1])

    def addError(self, test, err):
        super().addError(test, err)
        self._rec(test, "error", self._exc_info_to_string(err, test).strip().splitlines()[-1])


def python_suite():
    suite = unittest.defaultTestLoader.discover(str(ROOT / "tests"))
    runner = unittest.TextTestRunner(resultclass=Collect, verbosity=0, stream=open("nul" if sys.platform == "win32" else "/dev/null", "w"))
    return runner.run(suite).records


def js_suite():
    files = sorted(str(p) for p in (ROOT / "tests" / "js").glob("*.test.mjs"))
    out = subprocess.run(["node", "--test", "--test-reporter=junit", *files], cwd=ROOT, capture_output=True, text=True)
    records = []
    for case in ET.fromstring(out.stdout).iter("testcase"):
        fail = case.find("failure")
        records.append({"suite": "js", "test": case.get("name"), "status": "fail" if fail is not None else "pass",
                        "duration_ms": round(float(case.get("time", 0)) * 1000, 1),
                        "message": (fail.get("message") or "")[:300] if fail is not None else ""})
    return records


def main():
    phase = sys.argv[sys.argv.index("--phase") + 1] if "--phase" in sys.argv else "unspecified"
    now = datetime.now().astimezone()
    run_id = now.strftime("%Y%m%dT%H%M%S")
    records = python_suite() + js_suite()
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf8") as f:
        for r in records:
            f.write(json.dumps({"run_id": run_id, "timestamp": now.isoformat(timespec="seconds"), "phase": phase, **r}) + "\n")
    failed = [r for r in records if r["status"] != "pass"]
    print(f"run {run_id}: {len(records) - len(failed)}/{len(records)} passed")
    for r in failed:
        print(f"  {r['status'].upper()} {r['suite']}:{r['test']} — {r['message']}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
