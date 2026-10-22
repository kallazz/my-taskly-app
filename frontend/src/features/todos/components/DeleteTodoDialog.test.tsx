import type { MouseEvent } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { Button } from '../../../design-system'
import { todoFixture } from '../../../test/todoFixture'
import { useDeleteTodoMutation } from '../hooks/useDeleteTodoMutation'
import { DeleteTodoDialog } from './DeleteTodoDialog'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('../hooks/useDeleteTodoMutation', () => ({
  useDeleteTodoMutation: vi.fn(),
}))

const mutateAsync = vi.fn()

function mockDelete(state: object = {}) {
  vi.mocked(useDeleteTodoMutation).mockReturnValue({
    isPending: false,
    error: null,
    mutateAsync,
    ...state,
  } as unknown as ReturnType<typeof useDeleteTodoMutation>)
}

function renderDialog(busy = false) {
  const callbacks = { onClose: vi.fn(), onDeleted: vi.fn() }
  render(<DeleteTodoDialog todo={todoFixture} busy={busy} {...callbacks} />)
  return callbacks
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDelete()
})

it('shows a deletion error and allows cancelling without deleting', async () => {
  const user = userEvent.setup()
  mockDelete({ error: new Error('Could not delete.') })
  const { onClose, onDeleted } = renderDialog()
  expect(screen.getByRole('dialog', { name: 'Delete task?' })).toBeVisible()
  expect(
    screen.getByText(
      `The task “${todoFixture.title}” will be permanently deleted.`,
    ),
  ).toBeVisible()
  expect(screen.getByTestId('alert')).toHaveTextContent('Could not delete.')
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(onClose).toHaveBeenCalledTimes(1)
  expect(mutateAsync).not.toHaveBeenCalled()
  expect(onDeleted).not.toHaveBeenCalled()
})

it('deletes the task and reports success', async () => {
  const user = userEvent.setup()
  mutateAsync.mockResolvedValue(undefined)
  const { onDeleted } = renderDialog()
  expect(screen.queryByTestId('alert')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Delete task' }))
  await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
  expect(mutateAsync).toHaveBeenCalledWith(todoFixture.id)
})

it('stays open when deletion fails so the user can retry', async () => {
  const user = userEvent.setup()
  mutateAsync.mockRejectedValue(new Error('Could not delete.'))
  const { onClose, onDeleted } = renderDialog()
  await user.click(screen.getByRole('button', { name: 'Delete task' }))
  await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
  expect(onDeleted).not.toHaveBeenCalled()
  expect(onClose).not.toHaveBeenCalled()
})

it.each([
  ['the page is busy', true, false],
  ['the deletion is pending', false, true],
])('blocks every action while %s', (_, busy, isPending) => {
  mockDelete({ isPending })
  renderDialog(busy)
  expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()
})

it('ignores a delete request that arrives while one is pending', () => {
  mockDelete({ isPending: true })
  renderDialog()
  const deleteButton = vi
    .mocked(Button)
    .mock.calls.find(([props]) => props.variant === 'danger')!
  act(() => deleteButton[0].onClick!({} as MouseEvent<HTMLButtonElement>))
  expect(mutateAsync).not.toHaveBeenCalled()
})
