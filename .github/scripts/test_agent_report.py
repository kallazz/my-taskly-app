#!/usr/bin/env python3
"""Build the unit-test agent's PR comment from the analysis and an independent test run.

Usage: python3 .github/scripts/test_agent_report.py --run-url URL

Reads .test-agent/analysis.json and .test-agent/results-<stack>.json, checks that
commits made by the Copilot agent only touch test files, and writes
.test-agent/comment.md. Prints `key=value` outputs for GitHub Actions:
  needs_agent    changed lines lack tests or tests fail, so the agent should run
  head_by_agent  the latest commit was made by the agent (never re-request it)
  ok             tests pass and the agent stayed within test files
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / ".test-agent"
sys.path.insert(0, str(ROOT / ".github" / "skills" / "analyze-pr-changes"))
from analyze_changes import TEST_FILE  # noqa: E402

MARKER = "<!-- unit-test-agent -->"
AGENT_AUTHOR = re.compile(r"copilot", re.IGNORECASE)


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, check=True, capture_output=True, text=True).stdout


def agent_commits(merge_base: str) -> list[dict]:
    commits = []
    for line in git("log", "--format=%H%x09%an%x09%ae", f"{merge_base}..HEAD").splitlines():
        sha, name, email = line.split("\t")
        if AGENT_AUTHOR.search(name) or AGENT_AUTHOR.search(email):
            files = git("diff-tree", "--no-commit-id", "--name-only", "-r", sha).split()
            commits.append({"sha": sha, "outside_tests": [path for path in files if not TEST_FILE.search(path)]})
    return commits


def load(name: str) -> dict | None:
    path = OUT / name
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None


def build(run_url: str) -> tuple[str, dict]:
    analysis = load("analysis.json") or {"merge_base": "HEAD", "files": []}
    results = {stack: load(f"results-{stack}.json") for stack in ("backend", "frontend")}
    head = git("rev-parse", "--short", "HEAD").strip()
    head_author = git("log", "-1", "--format=%an %ae").strip()
    commits = agent_commits(analysis["merge_base"])
    violations = [(commit["sha"][:7], path) for commit in commits for path in commit["outside_tests"]]

    coverage = {
        path: info for result in results.values() if result for path, info in result.get("coverage", {}).items()
    }
    uncovered = {path: info for path, info in coverage.items() if "note" in info or info["uncovered_changed_lines"]}
    tests_ok = all(result is None or result["ok"] for result in results.values()) and any(results.values())
    needs_agent = bool(uncovered) or not tests_ok
    outputs = {
        "needs_agent": str(needs_agent).lower(),
        "head_by_agent": str(bool(AGENT_AUTHOR.search(head_author))).lower(),
        "ok": str(tests_ok and not violations).lower(),
    }

    if violations:
        status = "⛔ The agent changed files outside the test directories. Review its commits before merging."
    elif not tests_ok:
        status = "❌ Tests are failing."
    elif uncovered:
        status = "⚠️ Some changed lines are not covered by tests yet."
    elif not coverage:
        status = "✅ No application code changed, so no tests are needed."
    else:
        status = "✅ All tests pass and every changed line is covered."

    lines = [MARKER, "## 🧪 Unit-test agent", "", f"**Status:** {status}", ""]

    lines += ["### Changed files", "", "| File | Classification | Test file | Reason |", "|---|---|---|---|"]
    for record in analysis["files"]:
        test_file = record.get("test_file")
        target = f"`{test_file}` ({'update' if record['test_file_exists'] else 'create'})" if test_file else "—"
        lines.append(f"| `{record['path']}` | {record['category']} | {target} | {record['reason']} |")
    if not analysis["files"]:
        lines.append("| — | — | — | no changes |")

    lines += ["", f"### Test results (independent re-run on `{head}`)", "",
              "| Suite | Result | Passed | Failed | Skipped |", "|---|---|---|---|---|"]
    details = []
    for stack, result in results.items():
        if result is None:
            lines.append(f"| {stack} | not run | — | — | — |")
            continue
        lines.append(f"| {stack} | {'✅ pass' if result['ok'] else '❌ fail'} | {result['passed']} "
                     f"| {result['failed']} | {result['skipped']} |")
        for failure in result["failures"]:
            details.append(f"**{stack}: `{failure['test']}`**\n```\n{failure['message'][:1000]}\n```")
        typecheck = result.get("typecheck")
        if typecheck and not typecheck["ok"]:
            details.append("**frontend: TypeScript errors**\n```\n" + "\n".join(typecheck["errors"]) + "\n```")
    if details:
        lines += ["", "<details><summary>Failures</summary>", "", *details, "", "</details>"]

    if coverage:
        lines += ["", "### Coverage of changed lines", "", "| File | Changed lines covered | Uncovered lines |",
                  "|---|---|---|"]
        for path, info in coverage.items():
            if "note" in info:
                lines.append(f"| `{path}` | 0 | {info['note']} |")
            elif not info["changed_executable_lines"]:
                lines.append(f"| `{path}` | n/a | no executable lines changed (declarations or JSX markup only) |")
            else:
                missing = ", ".join(map(str, info["uncovered_changed_lines"])) or "—"
                lines.append(f"| `{path}` | {info['changed_lines_covered']}/{info['changed_executable_lines']} "
                             f"| {missing} |")

    lines += ["", "### Agent scope check", ""]
    if not commits:
        lines.append("No commits from the agent yet.")
    elif violations:
        lines += ["❌ Files changed outside the test directories:", ""]
        lines += [f"- `{path}` in {sha}" for sha, path in violations]
    else:
        lines.append(f"✅ {len(commits)} agent commit(s), all limited to test files.")

    lines += ["", f"<sub>[Workflow run]({run_url}) · updated on every push</sub>"]
    return "\n".join(lines) + "\n", outputs


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--run-url", default="")
    args = parser.parse_args()
    comment, outputs = build(args.run_url)
    OUT.mkdir(exist_ok=True)
    (OUT / "comment.md").write_text(comment, encoding="utf-8")
    for key, value in outputs.items():
        print(f"{key}={value}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
