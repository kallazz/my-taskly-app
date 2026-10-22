import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { TodoForm } from './TodoForm'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))

function renderForm(props: Partial<Parameters<typeof TodoForm>[0]> = {}) {
  const callbacks = {
    onSubmit: vi.fn().mockResolvedValue(undefined),
    onCancel: vi.fn(),
  }
  render(<TodoForm busy={false} error={null} {...callbacks} {...props} />)
  return callbacks
}

describe('TodoForm', () => {
  it('rejects a whitespace-only title without submitting', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <TodoForm
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        busy={false}
        error={null}
      />,
    )
    await user.type(screen.getByLabelText(/Task title/), '   ')
    await user.click(screen.getByRole('button', { name: 'Save task' }))
    expect(screen.getByText('Enter a task title.')).toBeVisible()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits trimmed values and the selected priority', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <TodoForm
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        busy={false}
        error={null}
      />,
    )
    await user.type(screen.getByLabelText(/Task title/), '  Prepare a demo  ')
    await user.selectOptions(screen.getByLabelText('Priority'), 'high')
    await user.click(screen.getByRole('button', { name: 'Save task' }))
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Prepare a demo',
      description: '',
      priority: 'high',
      due_date: null,
      completed: false,
    })
  })

  it('starts from an existing task and submits its edited values', async () => {
    const user = userEvent.setup()
    const initial = {
      ...todoFixture,
      description: 'Old notes',
      due_date: '2026-10-20',
    }
    const { onSubmit } = renderForm({ initial })
    expect(screen.getByLabelText(/Task title/)).toHaveValue(todoFixture.title)
    expect(screen.getByLabelText('Priority')).toHaveValue('medium')
    const description = screen.getByLabelText('Description (optional)')
    await user.clear(description)
    await user.type(description, '  New notes  ')
    await user.clear(screen.getByLabelText('Due date (optional)'))
    await user.click(screen.getByRole('button', { name: 'Save task' }))
    expect(onSubmit).toHaveBeenCalledWith({
      ...initial,
      description: 'New notes',
      due_date: null,
    })
  })

  it('submits a chosen due date', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm()
    await user.type(screen.getByLabelText(/Task title/), 'Book flights')
    await user.type(screen.getByLabelText('Due date (optional)'), '2026-11-03')
    await user.click(screen.getByRole('button', { name: 'Save task' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ due_date: '2026-11-03' }),
    )
  })

  it('shows every validation error and clears them once fixed', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm({
      initial: { ...todoFixture, title: '', description: 'x'.repeat(2001) },
    })
    await user.click(screen.getByRole('button', { name: 'Save task' }))
    expect(screen.getByText('Enter a task title.')).toBeVisible()
    expect(
      screen.getByText('The description must be at most 2000 characters.'),
    ).toBeVisible()
    await user.type(screen.getByLabelText(/Task title/), 'Fixed')
    await user.clear(screen.getByLabelText(/Description/))
    await user.click(screen.getByRole('button', { name: 'Save task' }))
    expect(screen.queryByText('Enter a task title.')).not.toBeInTheDocument()
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('shows the server error and forwards cancel', async () => {
    const user = userEvent.setup()
    const { onCancel, onSubmit } = renderForm({ error: 'Could not save.' })
    expect(screen.getByTestId('alert')).toHaveTextContent('Could not save.')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('locks the fields and actions while saving', () => {
    renderForm({ busy: true })
    expect(screen.getByRole('group')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.queryByTestId('alert')).not.toBeInTheDocument()
  })
})
