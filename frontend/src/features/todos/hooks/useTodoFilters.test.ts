import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { useTodoFilters } from './useTodoFilters'

const done = { ...todoFixture, id: 8, title: 'Ship release', completed: true }
const urgent = {
  ...todoFixture,
  id: 9,
  title: 'Fix bug',
  priority: 'high' as const,
}

it('starts with all tasks, no search and newest first', () => {
  const { result } = renderHook(() =>
    useTodoFilters([todoFixture, done, urgent]),
  )
  expect(result.current.filter).toBe('all')
  expect(result.current.search).toBe('')
  expect(result.current.sort).toBe('newest')
  expect(result.current.visible.map((todo) => todo.id)).toEqual([9, 8, 7])
})

it('recomputes the visible tasks when filters change', () => {
  const { result } = renderHook(() =>
    useTodoFilters([todoFixture, done, urgent]),
  )
  act(() => result.current.setFilter('active'))
  expect(result.current.visible.map((todo) => todo.id)).toEqual([9, 7])
  act(() => result.current.setSort('priority'))
  expect(result.current.sort).toBe('priority')
  expect(result.current.visible.map((todo) => todo.id)).toEqual([9, 7])
  act(() => result.current.setSearch('demo'))
  expect(result.current.search).toBe('demo')
  expect(result.current.visible).toEqual([todoFixture])
})

it('applies the current filters to new task data', () => {
  const { result, rerender } = renderHook(
    ({ todos }) => useTodoFilters(todos),
    {
      initialProps: { todos: [todoFixture] },
    },
  )
  act(() => result.current.setFilter('completed'))
  expect(result.current.visible).toEqual([])
  rerender({ todos: [todoFixture, done] })
  expect(result.current.visible).toEqual([done])
})
