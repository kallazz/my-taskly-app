import { renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { createQueryWrapper } from '../../../test/queryClientWrapper'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useDeleteTodoMutation } from './useDeleteTodoMutation'

vi.mock('../api/todos', () => ({ todosApi: { remove: vi.fn() } }))
beforeEach(() => vi.clearAllMocks())

const other = { ...todoFixture, id: 3, title: 'Other task' }

it('removes the deleted task from the cached list', async () => {
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)
  const { client, wrapper } = createQueryWrapper()
  client.setQueryData(todoKeys.list, [other, todoFixture])
  const { result } = renderHook(() => useDeleteTodoMutation(), { wrapper })
  await result.current.mutateAsync(7)
  expect(todosApi.remove).toHaveBeenCalledWith(7)
  expect(client.getQueryData(todoKeys.list)).toEqual([other])
})

it('does not create a list cache when none is loaded', async () => {
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)
  const { client, wrapper } = createQueryWrapper()
  const { result } = renderHook(() => useDeleteTodoMutation(), { wrapper })
  await result.current.mutateAsync(7)
  expect(client.getQueryData(todoKeys.list)).toBeUndefined()
})

it('keeps the task cached when deletion fails', async () => {
  vi.mocked(todosApi.remove).mockRejectedValue(new Error('Task not found.'))
  const { client, wrapper } = createQueryWrapper()
  client.setQueryData(todoKeys.list, [todoFixture])
  const { result } = renderHook(() => useDeleteTodoMutation(), { wrapper })
  await expect(result.current.mutateAsync(7)).rejects.toThrow('Task not found.')
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
})
