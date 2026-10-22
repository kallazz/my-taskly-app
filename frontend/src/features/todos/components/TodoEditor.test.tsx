import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { Drawer } from '../../../design-system'
import { todoFixture } from '../../../test/todoFixture'
import { useCreateTodoMutation } from '../hooks/useCreateTodoMutation'
import { useUpdateTodoMutation } from '../hooks/useUpdateTodoMutation'
import type { TodoInput } from '../types'
import { TodoEditor } from './TodoEditor'
import { TodoForm } from './TodoForm'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('../hooks/useCreateTodoMutation', () => ({
  useCreateTodoMutation: vi.fn(),
}))
vi.mock('../hooks/useUpdateTodoMutation', () => ({
  useUpdateTodoMutation: vi.fn(),
}))
vi.mock('./TodoForm', () => ({
  TodoForm: vi.fn(
    ({ onSubmit }: { onSubmit: (input: TodoInput) => Promise<void> }) => (
      <button onClick={() => void onSubmit(todoFixture)}>Submit form</button>
    ),
  ),
}))

const create = vi.fn()
const update = vi.fn()

function mockMutations({
  createState = {},
  updateState = {},
}: {
  createState?: object
  updateState?: object
} = {}) {
  vi.mocked(useCreateTodoMutation).mockReturnValue({
    isPending: false,
    error: null,
    mutateAsync: create,
    ...createState,
  } as unknown as ReturnType<typeof useCreateTodoMutation>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    isPending: false,
    error: null,
    mutateAsync: update,
    ...updateState,
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockMutations()
})

it('creates a new task and reports a successful save', async () => {
  const user = userEvent.setup()
  create.mockResolvedValue(todoFixture)
  const onSaved = vi.fn()
  render(
    <TodoEditor todo="new" busy={false} onClose={vi.fn()} onSaved={onSaved} />,
  )
  expect(screen.getByRole('dialog', { name: 'New task' })).toBeVisible()
  expect(vi.mocked(TodoForm).mock.calls[0][0].initial).toBeUndefined()
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('New task added.'))
  expect(create).toHaveBeenCalledWith(todoFixture)
  expect(update).not.toHaveBeenCalled()
})

it('updates an existing task and reports saved changes', async () => {
  const user = userEvent.setup()
  update.mockResolvedValue(todoFixture)
  const onSaved = vi.fn()
  render(
    <TodoEditor
      todo={todoFixture}
      busy={false}
      onClose={vi.fn()}
      onSaved={onSaved}
    />,
  )
  expect(screen.getByRole('dialog', { name: 'Edit task' })).toBeVisible()
  expect(vi.mocked(TodoForm).mock.calls[0][0].initial).toBe(todoFixture)
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('Changes saved.'))
  expect(update).toHaveBeenCalledWith({ id: 7, input: todoFixture })
  expect(create).not.toHaveBeenCalled()
})

it('keeps the editor open and shows the error of the active mutation', async () => {
  const user = userEvent.setup()
  update.mockRejectedValue(new Error('Task not found.'))
  mockMutations({
    createState: { error: new Error('Create error') },
    updateState: { error: new Error('Task not found.') },
  })
  const onSaved = vi.fn()
  render(
    <TodoEditor
      todo={todoFixture}
      busy={false}
      onClose={vi.fn()}
      onSaved={onSaved}
    />,
  )
  expect(vi.mocked(TodoForm).mock.calls[0][0].error).toBe('Task not found.')
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
  expect(onSaved).not.toHaveBeenCalled()
})

it.each([
  ['the page is busy', true, false],
  ['the mutation is pending', false, true],
])('does not save while %s', async (_, busy, isPending) => {
  const user = userEvent.setup()
  mockMutations({ createState: { isPending } })
  const onClose = vi.fn()
  render(
    <TodoEditor todo="new" busy={busy} onClose={onClose} onSaved={vi.fn()} />,
  )
  expect(vi.mocked(TodoForm).mock.calls[0][0]).toEqual(
    expect.objectContaining({ busy: true, error: null, onCancel: onClose }),
  )
  expect(vi.mocked(Drawer).mock.calls[0][0]).toEqual(
    expect.objectContaining({ busy: true, onClose }),
  )
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  expect(create).not.toHaveBeenCalled()
})
