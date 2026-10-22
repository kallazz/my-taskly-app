import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { TodoEmptyState } from './TodoEmptyState'
import { TodoItem } from './TodoItem'
import { TodoList } from './TodoList'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('./TodoEmptyState', () => ({
  TodoEmptyState: vi.fn(() => <p>Empty task list</p>),
}))
vi.mock('./TodoItem', () => ({
  TodoItem: vi.fn(
    ({
      todo,
      onToggle,
      onEdit,
      onDelete,
    }: {
      todo: { title: string }
      onToggle: () => void
      onEdit: () => void
      onDelete: () => void
    }) => (
      <li>
        {todo.title}
        <button onClick={onToggle}>Toggle</button>
        <button onClick={onEdit}>Edit</button>
        <button onClick={onDelete}>Delete</button>
      </li>
    ),
  ),
}))
beforeEach(() => vi.clearAllMocks())

const props = {
  todos: [],
  hasTodos: false,
  loading: false,
  failed: false,
  busy: false,
  onCreate: vi.fn(),
  onToggle: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
}

it('shows loading feedback before showing an empty list', () => {
  const { rerender } = render(<TodoList {...props} loading />)
  expect(screen.getByRole('status')).toHaveTextContent('Loading your tasks…')
  expect(screen.queryByText('Empty task list')).not.toBeInTheDocument()
  rerender(<TodoList {...props} loading={false} />)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(screen.getByText('Empty task list')).toBeVisible()
})

it('passes the empty state whether tasks exist and the busy flag', () => {
  render(<TodoList {...props} hasTodos busy />)
  expect(vi.mocked(TodoEmptyState).mock.calls[0][0]).toEqual({
    hasTodos: true,
    disabled: true,
    onCreate: props.onCreate,
  })
})

it('explains a failed first load instead of showing the empty state', () => {
  render(<TodoList {...props} failed />)
  expect(
    screen.getByRole('heading', {
      name: 'The task list is temporarily unavailable',
    }),
  ).toBeVisible()
  expect(screen.getByText('Try again to load your tasks.')).toBeVisible()
  expect(screen.queryByText('Empty task list')).not.toBeInTheDocument()
})

it('keeps showing cached tasks when a refetch fails', () => {
  render(<TodoList {...props} todos={[todoFixture]} hasTodos failed />)
  expect(screen.getByText(todoFixture.title)).toBeVisible()
  expect(
    screen.queryByText('The task list is temporarily unavailable'),
  ).not.toBeInTheDocument()
})

it('renders each task and forwards its actions with the task', async () => {
  const user = userEvent.setup()
  const second = { ...todoFixture, id: 8, title: 'Second task' }
  render(<TodoList {...props} todos={[todoFixture, second]} hasTodos busy />)
  const items = within(screen.getByRole('list')).getAllByRole('listitem')
  expect(items).toHaveLength(2)
  expect(vi.mocked(TodoItem).mock.calls[0][0]).toEqual(
    expect.objectContaining({ todo: todoFixture, busy: true }),
  )
  await user.click(within(items[1]).getByRole('button', { name: 'Toggle' }))
  await user.click(within(items[1]).getByRole('button', { name: 'Edit' }))
  await user.click(within(items[0]).getByRole('button', { name: 'Delete' }))
  expect(props.onToggle).toHaveBeenCalledWith(second)
  expect(props.onEdit).toHaveBeenCalledWith(second)
  expect(props.onDelete).toHaveBeenCalledWith(todoFixture)
})
