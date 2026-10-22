---
name: write-frontend-tests
description: Conventions for writing Vitest and React Testing Library unit tests for the React frontend in frontend/src. Use when creating or updating *.test.ts or *.test.tsx files.
---

# Write frontend tests

## Layout

- The test sits next to its source: `Foo.tsx` → `Foo.test.tsx`, `todos.ts` → `todos.test.ts`.
- Import test functions explicitly: `import { beforeEach, describe, expect, it, vi } from 'vitest'`.
- Fixtures: use `todoFixture` from `src/test/todoFixture.ts`, spreading it for variations (`{ ...todoFixture, id: 2, completed: true }`).
- Prettier style: no semicolons, single quotes, trailing commas. The `run-tests` script formats test files automatically.

## Mocking conventions

- **Design system:** components under test always mock it, with the path relative to the test file:
  ```ts
  vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
  ```
  The mocks render plain HTML: `Alert` has `data-testid="alert"`, `Drawer` renders `role="dialog"` with the title as its label, and `Input` and `Select` render a `<label>` wrapping the control. To assert on design-system props, use `vi.mocked(Alert).mock.calls[0][0]` and call `beforeEach(() => vi.clearAllMocks())`.
- **Hooks and child components:** mock the module, then set return values per test:
  ```ts
  vi.mock('../hooks/useDeleteTodoMutation', () => ({ useDeleteTodoMutation: vi.fn() }))
  vi.mocked(useDeleteTodoMutation).mockReturnValue({
    isPending: false, error: null, mutateAsync,
  } as unknown as ReturnType<typeof useDeleteTodoMutation>)
  ```
- **API module:** for hooks, mock `../api/todos` (`todosApi`). For `todosApi` itself, mock `../../../lib/http` (`request`).
- **`fetch`** (`src/lib/http.ts` only): `vi.stubGlobal('fetch', vi.fn())`, and `vi.unstubAllGlobals()` in `afterEach`.

## Testing hooks that use React Query

Use a real `QueryClient` from the shared helper (retries off), and mock only the API module:

```ts
import { createQueryWrapper } from '../../../test/queryClientWrapper'

vi.mock('../api/todos', () => ({ todosApi: { create: vi.fn() } }))

const { client, wrapper } = createQueryWrapper()
client.setQueryData(todoKeys.list, [todoFixture])
const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
await result.current.mutateAsync(input)
expect(client.getQueryData(todoKeys.list)).toEqual([...])
```

Seed and assert the cache with `client.setQueryData` and `getQueryData`. Use `waitFor` for query state (`isSuccess`, `isError`). The existing `src/features/todos/hooks/*.test.tsx` files are the reference.

## Components

- Query by role and accessible name (`getByRole('button', { name: 'Delete task' })`), then label, then text. Use `getByTestId` only for the `alert` mock.
- Use `const user = userEvent.setup()` and `await user.click(...)`. Use `rerender` to test prop changes.
- Cover each conditional branch: loading, error, empty, busy/disabled, and the success callbacks.
- **Timers and dates:** `vi.useFakeTimers()` and `vi.setSystemTime(new Date('2026-10-15T12:00:00'))`, with `vi.useRealTimers()` in `afterEach`. With fake timers, advance through `act(() => vi.advanceTimersByTime(4000))`.

## Quality bar

- Each test checks one behaviour, and its name says what the user or caller observes.
- Assert on outcomes (rendered text, callbacks with exact arguments, cache contents), not on implementation details.
- No `any`. Cast mocked hook results with `as unknown as ReturnType<typeof hook>`, as the existing tests do. `tsc` must pass.
