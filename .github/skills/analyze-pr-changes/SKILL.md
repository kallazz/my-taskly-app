---
name: analyze-pr-changes
description: Lists and classifies the files changed in a pull request (testable source, existing test, or skip) and maps each source file to its unit-test file. Use first, before deciding whether to create or update tests.
---

# Analyze pull request changes

Run from the repository root, passing the pull request's base branch:

```sh
python3 .github/skills/analyze-pr-changes/analyze_changes.py --base origin/master
```

The script compares the merge base with the working tree and writes `.test-agent/analysis.json`. Each entry has:

- `category`: `source` (testable application code), `test` (existing test code) or `skip`, with a `reason`.
- `test_file` and `test_file_exists` for source files: the conventional test location, and whether to update it or create it.
- `changed_lines`: line numbers added or modified in the source file.

## Deciding what to do with each file

The classification is a starting point. Read the diff (`git diff <merge_base> -- <path>`) before deciding.

- **Create** tests when a source file is new or gains behaviour that no test covers.
- **Update** the existing test file when the PR changes behaviour that it already tests. Read the existing tests first, and extend them rather than duplicating cases.
- **Skip** with a reason when the change has no observable behaviour: formatting, renames, comments, types only, or code that existing tests already cover (check with the `run-tests` skill's changed-line coverage).
- `skip` files can still matter. A change to `schemas.py` (validation rules) should be tested through the router or validator tests that exercise it.
- A test file that is already in the diff means the author wrote tests. Run them and only fill gaps.
