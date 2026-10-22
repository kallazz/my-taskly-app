import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Badge } from '../../../design-system'
import { todoFixture } from '../../../test/todoFixture'
import { TodoItem } from './TodoItem'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.useRealTimers())

function renderItem(todo = todoFixture, busy = false) {
  const callbacks = { onEdit: vi.fn(), onToggle: vi.fn(), onDelete: vi.fn() }
  render(<TodoItem todo={todo} busy={busy} {...callbacks} />)
  return callbacks
}

it('shows an active task and forwards edit requests', async () => {
  const user = userEvent.setup()
  const { onEdit, onToggle, onDelete } = renderItem()
  expect(screen.getByRole('heading', { name: todoFixture.title })).toBeVisible()
  expect(screen.getByText('To do')).toBeVisible()
  expect(screen.getByText('Medium')).toBeVisible()
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  await user.click(
    screen.getByRole('button', { name: `Edit: ${todoFixture.title}` }),
  )
  expect(onEdit).toHaveBeenCalledTimes(1)
  expect(onToggle).not.toHaveBeenCalled()
  expect(onDelete).not.toHaveBeenCalled()
})

it('forwards completion and delete requests', async () => {
  const user = userEvent.setup()
  const { onToggle, onDelete } = renderItem()
  await user.click(
    screen.getByRole('checkbox', { name: `Complete: ${todoFixture.title}` }),
  )
  await user.click(
    screen.getByRole('button', { name: `Delete: ${todoFixture.title}` }),
  )
  expect(onToggle).toHaveBeenCalledTimes(1)
  expect(onDelete).toHaveBeenCalledTimes(1)
})

it('shows a completed task with its id, description and priority', () => {
  renderItem({
    ...todoFixture,
    completed: true,
    description: 'Slides and\nrecording',
    priority: 'high',
  })
  expect(screen.getByText('Completed')).toBeVisible()
  expect(screen.getByText('High')).toBeVisible()
  expect(screen.getByText('#7')).toBeVisible()
  expect(screen.getByText(/Slides and/)).toBeVisible()
  expect(
    screen.getByRole('checkbox', {
      name: `Mark as active: ${todoFixture.title}`,
    }),
  ).toBeChecked()
  expect(vi.mocked(Badge).mock.calls[0][0]).toEqual(
    expect.objectContaining({ variant: 'success' }),
  )
})

it('omits the description and due date when they are empty', () => {
  renderItem()
  expect(screen.queryByText(/overdue/)).not.toBeInTheDocument()
  expect(Badge).toHaveBeenCalledTimes(1)
})

it('marks an active task with a past due date as overdue', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 15, 12))
  renderItem({ ...todoFixture, due_date: '2026-10-10' })
  expect(screen.getByText(/10 Oct 2026/)).toHaveTextContent(
    '10 Oct 2026 · overdue',
  )
  expect(vi.mocked(Badge).mock.calls[1][0]).toEqual(
    expect.objectContaining({ variant: 'warning' }),
  )
})

it('shows a future due date without the overdue warning', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 15, 12))
  renderItem({ ...todoFixture, due_date: '2026-10-20' })
  expect(screen.getByText('20 Oct 2026')).toBeVisible()
  expect(screen.queryByText(/overdue/)).not.toBeInTheDocument()
  expect(vi.mocked(Badge).mock.calls[1][0]).toEqual(
    expect.objectContaining({ variant: 'neutral' }),
  )
})

it('disables every action while busy', () => {
  renderItem(todoFixture, true)
  expect(screen.getByRole('checkbox')).toBeDisabled()
  for (const button of screen.getAllByRole('button')) {
    expect(button).toBeDisabled()
  }
})
