---
name: run-tests
description: Runs the backend (pytest) or frontend (Vitest) unit tests and reports failures, TypeScript errors and coverage of the lines changed in the pull request. Use after writing or updating tests, and to check whether changed code is already covered.
---

# Run tests

Always run tests through this script, from the repository root:

```sh
# Selected test files (paths from the repository root)
python3 .github/skills/run-tests/run_tests.py backend --tests backend/tests/features/todos/test_router.py
python3 .github/skills/run-tests/run_tests.py frontend --tests frontend/src/lib/http.test.ts

# Whole suites
python3 .github/skills/run-tests/run_tests.py all
```

What it does:

- Backend: runs `pytest` with coverage in `backend/`.
- Frontend: runs Prettier on the given test files, then `tsc --noEmit`, then `vitest run` with coverage in `frontend/`. CI also runs the format check and typecheck, so a test with a type error counts as failing.
- Writes `.test-agent/results-<stack>.json` and prints a summary. The exit code is 1 when any test fails, no tests ran, or TypeScript reports errors.

## Reading the results

- `FAILED <test>` lines carry the assertion message. Fix the test when the test is wrong (wrong selector, missing mock, wrong expectation about existing behaviour).
- If the source code contradicts its obvious intent (for example an off-by-one, or a missing 404), do **not** change the assertion to match the bug. Mark the test with `pytest.mark.xfail(reason=...)` or `it.fails(...)`, and report it as a suspected bug.
- `coverage <file>: X/Y changed lines covered, uncovered changed lines: [...]` shows which changed lines still lack a test. Aim for every changed executable line, and explain any line you leave uncovered.
- Finish with `run_tests.py all` to make sure nothing else broke.
