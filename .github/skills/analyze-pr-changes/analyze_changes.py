#!/usr/bin/env python3
"""Classify the files changed since the pull request's base branch.

Usage: python3 .github/skills/analyze-pr-changes/analyze_changes.py --base origin/master

Compares the merge base with the working tree, so it covers the pull request's
commits and any uncommitted edits. Writes .test-agent/analysis.json and prints
one line per changed file: its category (source, test or skip), the reason,
the conventional test file and the changed line numbers.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / ".test-agent" / "analysis.json"

TEST_FILE = re.compile(r"^backend/tests/.+\.py$|^frontend/src/.+\.test\.tsx?$|^frontend/src/test/")
# Mirrors the coverage exclusions in backend/pyproject.toml and frontend/vite.config.ts.
SKIP_RULES = [
    (re.compile(r"^backend/app/(.+/)?(__init__|main|schemas|models|types|constants)\.py$"),
     "declarative module; test behaviour changes through the code that uses it"),
    (re.compile(r"^frontend/src/design-system/"), "design system, covered by Storybook"),
    (re.compile(r"\.stories\.tsx?$"), "Storybook story"),
    (re.compile(r"(^|/)(types|index|constants)\.ts$|\.(types|constants|styles|variants)\.ts$"),
     "types, barrel, constants or styles"),
    (re.compile(r"^frontend/src/(main\.tsx|lib/queryClient\.ts)$|/queryKeys\.ts$"), "bootstrap or static configuration"),
]
HUNK = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@")


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, check=True, capture_output=True, text=True).stdout


def classify(path: str) -> dict:
    if TEST_FILE.search(path):
        return {"category": "test", "reason": "existing test code"}
    if path.startswith("backend/app/") and path.endswith(".py"):
        stack, test_file = "backend", "backend/tests/" + str(
            PurePosixPath(path).relative_to("backend/app").with_name(f"test_{PurePosixPath(path).name}")
        )
    elif path.startswith("frontend/src/") and re.search(r"\.tsx?$", path):
        stack, test_file = "frontend", re.sub(r"\.(tsx?)$", r".test.\1", path)
    else:
        return {"category": "skip", "reason": "not application source (docs, config, styles or tooling)"}
    for pattern, reason in SKIP_RULES:
        if pattern.search(path):
            return {"category": "skip", "stack": stack, "reason": reason}
    return {
        "category": "source",
        "stack": stack,
        "reason": "application code",
        "test_file": test_file,
        "test_file_exists": (ROOT / test_file).is_file(),
    }


def changed_lines(merge_base: str, path: str) -> list[int]:
    lines: list[int] = []
    for line in git("diff", "--unified=0", "--no-color", merge_base, "--", path).splitlines():
        match = HUNK.match(line)
        if match:
            start, count = int(match.group(1)), int(match.group(2) or 1)
            lines.extend(range(start, start + count))
    return lines


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base", required=True, help="base branch or SHA of the pull request, e.g. origin/master")
    args = parser.parse_args()

    merge_base = git("merge-base", args.base, "HEAD").strip()
    files = []
    for entry in git("diff", "--name-status", "--no-renames", merge_base).splitlines():
        status, path = entry.split("\t", 1)
        record = {"path": path, "status": status, **classify(path)}
        if status == "D":
            record.update(category="skip", reason="deleted; make sure no test still imports it")
            record.pop("test_file", None), record.pop("test_file_exists", None)
        if record["category"] == "source":
            record["changed_lines"] = changed_lines(merge_base, path)
        files.append(record)

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps({"merge_base": merge_base, "files": files}, indent=2) + "\n", encoding="utf-8")
    for record in files:
        target = ""
        if "test_file" in record:
            target = f" -> {record['test_file']} ({'update' if record['test_file_exists'] else 'create'})"
        print(f"{record['category']:<6} {record['path']}{target}  [{record['reason']}]")
    print(f"Wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
