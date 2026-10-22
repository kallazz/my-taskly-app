#!/usr/bin/env python3
"""Run backend and/or frontend unit tests and summarise the results as JSON.

Usage:
  python3 .github/skills/run-tests/run_tests.py backend|frontend|all [--tests PATH ...]

Without --tests the whole suite of the stack runs. Writes
.test-agent/results-<stack>.json with pass/fail counts, failure messages,
TypeScript errors (frontend) and coverage of the lines changed in the pull
request (when .test-agent/analysis.json exists). Exits 1 when anything fails.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / ".test-agent"
TIMEOUT_SECONDS = 900
MAX_MESSAGE = 1500


def run(command: list[str], cwd: Path) -> tuple[int, str]:
    env = {**os.environ, "CI": "true", "FORCE_COLOR": "0", "NO_COLOR": "1"}
    try:
        result = subprocess.run(command, cwd=cwd, env=env, capture_output=True, text=True, timeout=TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        return 124, f"Timed out after {TIMEOUT_SECONDS}s: {' '.join(command)}"
    return result.returncode, result.stdout + result.stderr


def parse_junit(path: Path) -> dict:
    summary = {"total": 0, "passed": 0, "failed": 0, "skipped": 0, "failures": []}
    if not path.is_file():
        return summary
    for case in ET.parse(path).getroot().iter("testcase"):
        summary["total"] += 1
        problem = case.find("failure")
        if problem is None:
            problem = case.find("error")
        if problem is not None:
            summary["failed"] += 1
            message = (problem.get("message") or "") + "\n" + (problem.text or "")
            summary["failures"].append({
                "test": f"{case.get('classname', '')}::{case.get('name', '')}",
                "message": message.strip()[:MAX_MESSAGE],
            })
        elif case.find("skipped") is not None:
            summary["skipped"] += 1
        else:
            summary["passed"] += 1
    return summary


def changed_sources(stack: str) -> dict[str, list[int]]:
    analysis_file = OUT / "analysis.json"
    if not analysis_file.is_file():
        return {}
    analysis = json.loads(analysis_file.read_text(encoding="utf-8"))
    return {
        record["path"]: record.get("changed_lines", [])
        for record in analysis["files"]
        if record["category"] == "source" and record["stack"] == stack
    }


def summarise_lines(changed: list[int], executable: set[int], covered: set[int]) -> dict:
    relevant = [line for line in changed if line in executable]
    uncovered = [line for line in relevant if line not in covered]
    return {
        "file_line_rate": round(100 * len(covered) / len(executable), 1) if executable else None,
        "changed_executable_lines": len(relevant),
        "changed_lines_covered": len(relevant) - len(uncovered),
        "uncovered_changed_lines": uncovered,
    }


def backend_coverage(report: Path) -> dict:
    files = json.loads(report.read_text(encoding="utf-8"))["files"] if report.is_file() else {}
    result = {}
    for path, changed in changed_sources("backend").items():
        data = files.get(path.removeprefix("backend/"))
        if data is None:
            result[path] = {"note": "not imported by the tests that ran"}
            continue
        executed, missing = set(data["executed_lines"]), set(data["missing_lines"])
        result[path] = summarise_lines(changed, executed | missing, executed)
    return result


def frontend_coverage(report: Path) -> dict:
    files = json.loads(report.read_text(encoding="utf-8")) if report.is_file() else {}
    by_path = {Path(key).resolve().relative_to(ROOT).as_posix(): value for key, value in files.items()}
    result = {}
    for path, changed in changed_sources("frontend").items():
        data = by_path.get(path)
        if data is None:
            result[path] = {"note": "not imported by the tests that ran"}
            continue
        executable: set[int] = set()
        covered: set[int] = set()
        for statement_id, location in data["statementMap"].items():
            line = location["start"]["line"]
            executable.add(line)
            if data["s"][statement_id] > 0:
                covered.add(line)
        result[path] = summarise_lines(changed, executable, covered)
    return result


def run_backend(tests: list[str]) -> dict:
    junit, coverage = OUT / "junit-backend.xml", OUT / "coverage-backend.json"
    for stale in (junit, coverage):
        stale.unlink(missing_ok=True)
    venv_python = ROOT / "backend" / ".venv" / "bin" / "python"
    python = str(venv_python) if venv_python.is_file() else sys.executable
    command = [
        python, "-m", "pytest", "-q", "-p", "no:cacheprovider", f"--junitxml={junit}",
        "--cov=app", f"--cov-report=json:{coverage}", "--cov-report=",
        *[test.removeprefix("backend/") for test in tests],
    ]
    code, output = run(command, ROOT / "backend")
    return {
        "command": " ".join(["python -m pytest", *tests]),
        "exit_code": code,
        **parse_junit(junit),
        "coverage": backend_coverage(coverage),
        "output_tail": output[-3000:] if code not in (0, 1) else "",
    }


def run_frontend(tests: list[str]) -> dict:
    frontend = ROOT / "frontend"
    bin_dir = frontend / "node_modules" / ".bin"
    junit, coverage_dir = OUT / "junit-frontend.xml", OUT / "coverage-frontend"
    junit.unlink(missing_ok=True)
    relative_tests = [test.removeprefix("frontend/") for test in tests]
    if relative_tests:
        # Generated tests must pass `npm run format:check` in CI.
        run([str(bin_dir / "prettier"), "--write", *relative_tests], frontend)
    tsc_code, tsc_output = run([str(bin_dir / "tsc"), "--noEmit", "--pretty", "false"], frontend)
    command = [
        str(bin_dir / "vitest"), "run", "--reporter=dot", "--reporter=junit", f"--outputFile.junit={junit}",
        "--coverage.enabled=true", "--coverage.reportOnFailure=true", "--coverage.reporter=json",
        f"--coverage.reportsDirectory={coverage_dir}",
        *relative_tests,
    ]
    code, output = run(command, frontend)
    return {
        "command": " ".join(["vitest run", *tests]),
        "exit_code": code,
        **parse_junit(junit),
        "typecheck": {
            "ok": tsc_code == 0,
            "errors": [line for line in tsc_output.splitlines() if ": error TS" in line][:30],
        },
        "coverage": frontend_coverage(coverage_dir / "coverage-final.json"),
        "output_tail": output[-3000:] if code != 0 and not junit.is_file() else "",
    }


def validate_tests(stack: str, tests: list[str]) -> list[str]:
    for test in tests:
        if not test.startswith(f"{stack}/") or not (ROOT / test).is_file():
            raise SystemExit(f"error: {test} is not an existing {stack} test file (use a path from the repository root)")
    return tests


def report(stack: str, result: dict) -> None:
    status = "PASS" if result["ok"] else "FAIL"
    print(f"[{status}] {stack}: {result['passed']} passed, {result['failed']} failed, "
          f"{result['skipped']} skipped ({result['duration_s']}s) — {result['command']}")
    for failure in result["failures"]:
        print(f"  FAILED {failure['test']}\n    " + failure["message"].replace("\n", "\n    ")[:800])
    if "typecheck" in result and not result["typecheck"]["ok"]:
        print("  TypeScript errors:\n    " + "\n    ".join(result["typecheck"]["errors"]))
    for path, coverage in result["coverage"].items():
        if "note" in coverage:
            print(f"  coverage {path}: {coverage['note']}")
        else:
            print(f"  coverage {path}: {coverage['changed_lines_covered']}/{coverage['changed_executable_lines']} "
                  f"changed lines covered, uncovered changed lines: {coverage['uncovered_changed_lines'] or 'none'}")
    if result["output_tail"]:
        print("  Output:\n" + result["output_tail"])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("stack", choices=["backend", "frontend", "all"])
    parser.add_argument("--tests", nargs="*", default=[], help="test files to run (default: whole suite)")
    args = parser.parse_args()
    if args.stack == "all" and args.tests:
        parser.error("--tests requires a single stack")

    OUT.mkdir(exist_ok=True)
    ok = True
    for stack in (["backend", "frontend"] if args.stack == "all" else [args.stack]):
        tests = validate_tests(stack, args.tests)
        started = time.monotonic()
        result = run_backend(tests) if stack == "backend" else run_frontend(tests)
        result["duration_s"] = round(time.monotonic() - started, 1)
        result["scope"] = "selected tests" if tests else "full suite"
        result["ok"] = (
            result["exit_code"] == 0 and result["failed"] == 0 and result["total"] > 0
            and result.get("typecheck", {}).get("ok", True)
        )
        (OUT / f"results-{stack}.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        report(stack, result)
        ok = ok and result["ok"]
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
