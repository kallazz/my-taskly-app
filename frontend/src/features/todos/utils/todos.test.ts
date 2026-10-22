import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  countCompleted,
  formatDate,
  isOverdue,
  priorityLabels,
  selectTodos,
  validateTodo,
} from './todos'
import type { Todo, TodoInput } from '../types'

const base: Todo = {
  id: 1,
  title: 'Sprint plan',
  description: '',
  priority: 'medium',
  completed: false,
  due_date: null,
  created_at: '2026-10-01T12:00:00Z',
  updated_at: '2026-10-01T12:00:00Z',
}

const input: TodoInput = {
  title: 'Sprint plan',
  description: '',
  priority: 'medium',
  due_date: null,
  completed: false,
}

afterEach(() => vi.useRealTimers())

describe('selectTodos', () => {
  it('combines status with a case-insensitive search in the description', () => {
    const matching = { ...base, description: 'Discuss the API' }
    const todos = [
      matching,
      { ...matching, id: 2, completed: true },
      { ...base, id: 3 },
    ]
    expect(selectTodos(todos, 'active', ' api ', 'newest')).toEqual([matching])
  })

  it('searches titles and returns only completed tasks for the completed filter', () => {
    const done = { ...base, id: 2, title: 'Release notes', completed: true }
    const todos = [base, done, { ...done, id: 3, title: 'Other' }]
    expect(selectTodos(todos, 'completed', 'RELEASE', 'newest')).toEqual([done])
  })

  it('sorts by priority without changing the source array', () => {
    const high: Todo = { ...base, id: 2, priority: 'high' }
    const todos = [base, high]
    expect(selectTodos(todos, 'all', '', 'priority')).toEqual([high, base])
    expect(todos).toEqual([base, high])
  })

  it('breaks priority ties by the newest id and puts low priority last', () => {
    const low: Todo = { ...base, id: 3, priority: 'low' }
    const older: Todo = { ...base, id: 2 }
    expect(selectTodos([low, older, base], 'all', '', 'priority')).toEqual([
      older,
      base,
      low,
    ])
  })

  it('sorts by due date with undated tasks last and ties by newest id', () => {
    const soon: Todo = { ...base, id: 2, due_date: '2026-10-05' }
    const later: Todo = { ...base, id: 3, due_date: '2026-11-01' }
    const sameDay: Todo = { ...base, id: 4, due_date: '2026-10-05' }
    expect(selectTodos([base, later, soon, sameDay], 'all', '', 'due')).toEqual(
      [sameDay, soon, later, base],
    )
  })

  it('orders undated tasks by newest id when sorting by due date', () => {
    const undated: Todo = { ...base, id: 2 }
    expect(selectTodos([base, undated], 'all', '', 'due')).toEqual([
      undated,
      base,
    ])
  })

  it('sorts newest first by creation time, then by id', () => {
    const newer: Todo = { ...base, id: 2, created_at: '2026-10-02T08:00:00Z' }
    const twin: Todo = { ...base, id: 3 }
    expect(selectTodos([base, newer, twin], 'all', '', 'newest')).toEqual([
      newer,
      twin,
      base,
    ])
  })
})

describe('validateTodo', () => {
  it('accepts a valid task', () => {
    expect(validateTodo({ ...input, due_date: '2028-02-29' })).toEqual({})
  })

  it.each([
    ['', 'Enter a task title.'],
    ['   ', 'Enter a task title.'],
    ['x'.repeat(121), 'The title must be at most 120 characters.'],
  ])('rejects the title %j', (title, message) => {
    expect(validateTodo({ ...input, title })).toEqual({ title: message })
  })

  it('measures limits after trimming whitespace', () => {
    expect(
      validateTodo({
        ...input,
        title: ` ${'x'.repeat(120)} `,
        description: ` ${'y'.repeat(2000)} `,
      }),
    ).toEqual({})
  })

  it('rejects a description longer than 2000 characters', () => {
    expect(validateTodo({ ...input, description: 'x'.repeat(2001) })).toEqual({
      description: 'The description must be at most 2000 characters.',
    })
  })

  it.each(['2026-02-30', '2027-02-29', '2026-13-01', '15.10.2026', '2026-1-5'])(
    'rejects the invalid due date %s',
    (due_date) => {
      expect(validateTodo({ ...input, due_date })).toEqual({
        due_date: 'Enter a valid date.',
      })
    },
  )

  it('reports every invalid field at once', () => {
    expect(
      Object.keys(
        validateTodo({
          ...input,
          title: '',
          description: 'x'.repeat(2001),
          due_date: 'soon',
        }),
      ),
    ).toEqual(['title', 'description', 'due_date'])
  })
})

describe('isOverdue', () => {
  it('flags only active tasks due before today in local time', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 15, 0, 30))
    expect(isOverdue({ ...base, due_date: '2026-10-14' })).toBe(true)
    expect(isOverdue({ ...base, due_date: '2026-10-15' })).toBe(false)
    expect(isOverdue({ ...base, due_date: '2026-10-16' })).toBe(false)
    expect(
      isOverdue({ ...base, due_date: '2026-10-14', completed: true }),
    ).toBe(false)
    expect(isOverdue(base)).toBe(false)
  })
})

describe('countCompleted', () => {
  it('counts only completed tasks', () => {
    expect(
      countCompleted([
        base,
        { ...base, id: 2, completed: true },
        { ...base, id: 3, completed: true },
      ]),
    ).toBe(2)
  })
})

describe('formatting', () => {
  it('formats due dates in British English without shifting the day', () => {
    expect(formatDate('2026-10-05')).toBe('5 Oct 2026')
    expect(formatDate('2026-01-31')).toBe('31 Jan 2026')
  })

  it('labels every priority', () => {
    expect(priorityLabels).toEqual({
      low: 'Low',
      medium: 'Medium',
      high: 'High',
    })
  })
})
