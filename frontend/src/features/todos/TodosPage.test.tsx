import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { SuccessNotice } from '../../components/SuccessNotice'
import { useNotice } from '../../hooks/useNotice'
import { todoFixture } from '../../test/todoFixture'
import { DeleteTodoDialog } from './components/DeleteTodoDialog'
import { TodoEditor } from './components/TodoEditor'
import { TodoFilters } from './components/TodoFilters'
import { TodoList } from './components/TodoList'
import { TodosHeader } from './components/TodosHeader'
import { useTodoFilters } from './hooks/useTodoFilters'
import { useTodosBusy } from './hooks/useTodosBusy'
import { useTodosQuery } from './hooks/useTodosQuery'
import { useUpdateTodoMutation } from './hooks/useUpdateTodoMutation'
import { TodosPage } from './TodosPage'

vi.mock('../../design-system', () => import('../../design-system/mocks'))
vi.mock('../../hooks/useNotice', () => ({ useNotice: vi.fn() }))
vi.mock('./hooks/useTodoFilters', () => ({ useTodoFilters: vi.fn() }))
vi.mock('./hooks/useTodosBusy', () => ({ useTodosBusy: vi.fn() }))
vi.mock('./hooks/useTodosQuery', () => ({ useTodosQuery: vi.fn() }))
vi.mock('./hooks/useUpdateTodoMutation', () => ({
  useUpdateTodoMutation: vi.fn(),
}))
vi.mock('./components/TodosHeader', () => ({
  TodosHeader: vi.fn(() => <h1>Tasks</h1>),
}))
vi.mock('./components/TodoFilters', () => ({ TodoFilters: vi.fn(() => null) }))
vi.mock('./components/TodoList', () => ({
  TodoList: vi.fn(() => <p>Task list</p>),
}))
vi.mock('./components/TodoEditor', () => ({ TodoEditor: vi.fn(() => null) }))
vi.mock('./components/DeleteTodoDialog', () => ({
  DeleteTodoDialog: vi.fn(() => null),
}))
vi.mock('../../components/SuccessNotice', () => ({
  SuccessNotice: vi.fn(() => null),
}))

const notify = vi.fn()
const mutateAsync = vi.fn()
const refetch = vi.fn().mockResolvedValue(undefined)
const reset = vi.fn()
const filters = {
  filter: 'all' as const,
  search: '',
  sort: 'newest' as const,
  visible: [todoFixture],
  setFilter: vi.fn(),
  setSearch: vi.fn(),
  setSort: vi.fn(),
}

function mockPage({
  query = {},
  update = {},
  busy = false,
}: { query?: object; update?: object; busy?: boolean } = {}) {
  vi.mocked(useTodosQuery).mockReturnValue({
    data: [todoFixture],
    isPending: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch,
    ...query,
  } as unknown as ReturnType<typeof useTodosQuery>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    error: null,
    reset,
    mutateAsync,
    ...update,
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  vi.mocked(useTodosBusy).mockReturnValue(busy)
  vi.mocked(useNotice).mockReturnValue({ message: 'Saved.', notify })
  vi.mocked(useTodoFilters).mockReturnValue(filters)
}

const lastProps = <P,>(component: (props: P) => unknown) =>
  vi.mocked(component).mock.lastCall![0]

beforeEach(() => {
  vi.clearAllMocks()
  mockPage()
})

it('displays a query failure and resets mutation errors before retrying', async () => {
  const user = userEvent.setup()
  mockPage({
    query: {
      data: [],
      isError: true,
      error: new Error('The server is unavailable.'),
    },
  })
  render(<TodosPage />)
  expect(screen.getByTestId('alert')).toHaveTextContent(
    'The server is unavailable.',
  )
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1))
  expect(reset).toHaveBeenCalledTimes(1)
  expect(reset.mock.invocationCallOrder[0]).toBeLessThan(
    refetch.mock.invocationCallOrder[0],
  )
})

it('wires the query, filters and notice into the page', () => {
  render(<TodosPage />)
  expect(useTodoFilters).toHaveBeenCalledWith([todoFixture])
  expect(lastProps(TodosHeader)).toEqual(
    expect.objectContaining({ disabled: false, completed: 0, total: 1 }),
  )
  expect(lastProps(TodoFilters)).toEqual({
    filter: 'all',
    search: '',
    sort: 'newest',
    onFilterChange: filters.setFilter,
    onSearchChange: filters.setSearch,
    onSortChange: filters.setSort,
  })
  expect(lastProps(TodoList)).toEqual(
    expect.objectContaining({
      todos: [todoFixture],
      hasTodos: true,
      loading: false,
      failed: false,
      busy: false,
    }),
  )
  expect(lastProps(SuccessNotice)).toEqual({ message: 'Saved.' })
  expect(screen.queryByTestId('alert')).not.toBeInTheDocument()
  expect(TodoEditor).not.toHaveBeenCalled()
  expect(DeleteTodoDialog).not.toHaveBeenCalled()
})

it('treats missing data as an empty list while loading', () => {
  mockPage({ query: { data: undefined, isPending: true } })
  render(<TodosPage />)
  expect(useTodoFilters).toHaveBeenCalledWith([])
  expect(lastProps(TodosHeader)).toEqual(
    expect.objectContaining({ disabled: true, completed: 0, total: 0 }),
  )
  expect(lastProps(TodoList)).toEqual(
    expect.objectContaining({ hasTodos: false, loading: true }),
  )
})

it('passes completed and total counts to the header', () => {
  mockPage({
    query: {
      data: [todoFixture, { ...todoFixture, id: 8, completed: true }],
    },
  })
  render(<TodosPage />)
  expect(lastProps(TodosHeader)).toEqual(
    expect.objectContaining({ completed: 1, total: 2 }),
  )
})

it('prefers the toggle error and disables retry while busy or fetching', () => {
  mockPage({
    query: { isFetching: true, error: new Error('Query error') },
    update: { error: new Error('Could not update.') },
  })
  render(<TodosPage />)
  expect(screen.getByTestId('alert')).toHaveTextContent('Could not update.')
  expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled()
})

it.each([
  [false, true, 'Another task complete. Well done!'],
  [true, false, 'Task marked as active.'],
])(
  'toggles a task with completed=%s and announces the result',
  async (completed, saved, message) => {
    const todo = { ...todoFixture, completed }
    mutateAsync.mockResolvedValue({ ...todo, completed: saved })
    render(<TodosPage />)
    act(() => lastProps(TodoList).onToggle(todo))
    await waitFor(() => expect(notify).toHaveBeenCalledWith(message))
    expect(mutateAsync).toHaveBeenCalledWith({
      id: 7,
      input: { completed: saved },
    })
  },
)

it('keeps quiet when toggling fails, leaving the error to the alert', async () => {
  mutateAsync.mockRejectedValue(new Error('Could not update.'))
  render(<TodosPage />)
  act(() => lastProps(TodoList).onToggle(todoFixture))
  await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
  expect(notify).not.toHaveBeenCalled()
})

it('ignores toggles while another change is in progress', () => {
  mockPage({ busy: true })
  render(<TodosPage />)
  act(() => lastProps(TodoList).onToggle(todoFixture))
  expect(mutateAsync).not.toHaveBeenCalled()
  expect(lastProps(TodoList)).toEqual(expect.objectContaining({ busy: true }))
})

it('opens the editor for a new task from the header', () => {
  render(<TodosPage />)
  act(() => lastProps(TodosHeader).onCreate())
  expect(lastProps(TodoEditor)).toEqual(
    expect.objectContaining({ todo: 'new', busy: false }),
  )
})

it('closes the editor after saving and announces the result', () => {
  render(<TodosPage />)
  act(() => lastProps(TodoList).onCreate())
  const onSaved = lastProps(TodoEditor).onSaved
  vi.mocked(TodoEditor).mockClear()
  act(() => onSaved('New task added.'))
  expect(notify).toHaveBeenCalledWith('New task added.')
  expect(TodoEditor).not.toHaveBeenCalled()
})

it('closes the editor without announcing anything', () => {
  render(<TodosPage />)
  act(() => lastProps(TodosHeader).onCreate())
  const onClose = lastProps(TodoEditor).onClose
  vi.mocked(TodoEditor).mockClear()
  act(() => onClose())
  expect(TodoEditor).not.toHaveBeenCalled()
  expect(notify).not.toHaveBeenCalled()
})

it('opens the editor for an existing task', () => {
  render(<TodosPage />)
  act(() => lastProps(TodoList).onEdit(todoFixture))
  expect(lastProps(TodoEditor)).toEqual(
    expect.objectContaining({ todo: todoFixture }),
  )
})

it('confirms deletion, then closes the dialog and announces it', () => {
  render(<TodosPage />)
  act(() => lastProps(TodoList).onDelete(todoFixture))
  expect(lastProps(DeleteTodoDialog)).toEqual(
    expect.objectContaining({ todo: todoFixture, busy: false }),
  )
  const onDeleted = lastProps(DeleteTodoDialog).onDeleted
  vi.mocked(DeleteTodoDialog).mockClear()
  act(() => onDeleted())
  expect(notify).toHaveBeenCalledWith('Task deleted.')
  expect(DeleteTodoDialog).not.toHaveBeenCalled()
})

it('closes the delete confirmation without deleting', () => {
  render(<TodosPage />)
  act(() => lastProps(TodoList).onDelete(todoFixture))
  const onClose = lastProps(DeleteTodoDialog).onClose
  vi.mocked(DeleteTodoDialog).mockClear()
  act(() => onClose())
  expect(DeleteTodoDialog).not.toHaveBeenCalled()
  expect(notify).not.toHaveBeenCalled()
})
