# Solution: unit-test agent for pull requests

On every pull request, a GitHub Actions workflow analyzes the change and runs the tests. When changed code lacks tests, it starts a GitHub Copilot custom agent that writes them. The workflow then re-runs all tests independently and posts the results as a PR comment.

## Where things are

| Path | What it is |
|---|---|
| `.github/agents/unit-test-agent.agent.md` | Custom agent: workflow, rules, report format |
| `.github/skills/analyze-pr-changes/` | Skill: classifies changed files and maps them to test files |
| `.github/skills/write-backend-tests/`, `write-frontend-tests/` | Skills: the repo's pytest and Vitest conventions |
| `.github/skills/run-tests/` | Skill: runs the tests and reports failures and coverage of changed lines |
| `.github/workflows/test-agent.yml`, `.github/scripts/test_agent_report.py` | Agentic workflow and its PR report |
| `.github/workflows/copilot-setup-steps.yml` | Installs dependencies for the agent |

The workflow asks `@copilot` to use `unit-test-agent`. The agent uses the skills in order: analyze the change, decide per file whether to create, update or skip tests, write them, then run and fix them (up to 3 rounds). The skills are Markdown plus small Python scripts, so people can use them too.

## Main decisions

- **Scripts do everything that doesn't need a model:** diff analysis, test runs, the decision to call the agent, and the final verdict.
- **The agent runs only when changed lines are uncovered or tests fail**, which saves quota.
- **The agent's work isn't trusted.** Every push re-runs both suites, and the check fails if an agent commit touches non-test files.
- **Least privilege.** The job that runs PR code has a read-only token and no secrets. The jobs that comment or call the agent never run PR code. The agent isn't re-requested for its own pushes (`github.actor`, which PR code can't forge). Actions are pinned to SHAs.
- **Tests encode intended behaviour.** The agent may not change app code or weaken assertions. Suspected bugs are marked `xfail` / `it.fails` and reported.

## Running it

**Prerequisites:**
1. Copilot cloud agent enabled for the repository.
2. *Settings → Copilot → Cloud agent:* turn off *Require approval for workflow runs* (safe: no job that runs PR code has secrets or write access).
3. A fine-grained token for this repository (*Pull requests* and *Issues*: read and write), saved as the secret `COPILOT_TRIGGER_TOKEN`. Comments from the Actions bot don't start Copilot.

**Usage:** open or update a PR. Without the token, everything except the agent request still runs.

Coverage of the existing code went from 42% to 100% (backend) and from 46% to 100% (frontend). These tests were written with an AI assistant following the same skills.

## Example run

[PR #2](https://github.com/kallazz/my-taskly-app/pull/2) adds `GET /api/todos/stats` and an "X of Y tasks completed" header line, without tests.

1. **Analysis.** Five source files were marked for testing. `schemas.py` and `styles.css` were skipped. Result: ❌ `test_factory.py` failed on the new route, `TodosHeader.test.tsx` had a type error, and 4 changed backend lines were uncovered.
2. **Agent.** The session log shows `analyze-pr-changes` in use. One commit followed, changing 6 test files and no app code:
   - updated the repository and router tests for the stats endpoint
   - extended the factory test's expected routes, without loosening it
   - updated the header, page and `countCompleted()` tests
3. **Verification.** ✅ 67 backend and 114 frontend tests passed. All changed executable lines were covered. Scope check ✅: test files only. The agent wasn't re-triggered.

## Assumptions

- Unit tests stay isolated like the existing ones: no database, network or browser.
- Files already excluded from coverage (schemas, models, design system, types) need no tests.
- PRs come from branches in this repository and target `master`.

## Limitations

- The agent request is posted under the token owner's name.
- Scope is checked after the fact, not prevented. In the demo, Copilot also skipped the requested report format.
- A PR can change the agent and skill files it runs with.
- Coverage shows execution, not assertion quality. Frontend changed-line coverage ignores JSX conditions.
- Every push by a person with uncovered lines requests the agent again.

## Production changes

- CODEOWNERS for `.github/`, and a required **Unit-test agent** check.
- An organization-level, rotated credential instead of a personal token.
- Branch coverage and mutation testing (mutmut, Stryker).
- One agent request per PR state, a per-PR budget, and agent metrics.
- Automatic revert of out-of-scope agent commits.
