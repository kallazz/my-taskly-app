import { renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { createQueryWrapper } from '../../../test/queryClientWrapper'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useUpdateTodoMutation } from './useUpdateTodoMutation'

vi.mock('../api/todos', () => ({ todosApi: { update: vi.fn() } }))
beforeEach(() => vi.clearAllMocks())

const other = { ...todoFixture, id: 3, title: 'Other task' }

it('updates the task in place in the cached list', async () => {
  const saved = { ...todoFixture, completed: true }
  vi.mocked(todosApi.update).mockResolvedValue(saved)
  const { client, wrapper } = createQueryWrapper()
  client.setQueryData(todoKeys.list, [other, todoFixture])
  const { result } = renderHook(() => useUpdateTodoMutation(), { wrapper })
  await expect(
    result.current.mutateAsync({ id: 7, input: { completed: true } }),
  ).resolves.toEqual(saved)
  expect(todosApi.update).toHaveBeenCalledWith(7, { completed: true })
  expect(client.getQueryData(todoKeys.list)).toEqual([other, saved])
})

it('does not create a list cache when none is loaded', async () => {
  vi.mocked(todosApi.update).mockResolvedValue(todoFixture)
  const { client, wrapper } = createQueryWrapper()
  const { result } = renderHook(() => useUpdateTodoMutation(), { wrapper })
  await result.current.mutateAsync({ id: 7, input: { title: 'Renamed' } })
  expect(client.getQueryData(todoKeys.list)).toBeUndefined()
})

it('leaves the cache untouched when the update fails', async () => {
  vi.mocked(todosApi.update).mockRejectedValue(new Error('Task not found.'))
  const { client, wrapper } = createQueryWrapper()
  client.setQueryData(todoKeys.list, [todoFixture])
  const { result } = renderHook(() => useUpdateTodoMutation(), { wrapper })
  await expect(
    result.current.mutateAsync({ id: 7, input: { completed: true } }),
  ).rejects.toThrow('Task not found.')
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
})
