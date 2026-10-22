import { renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { createQueryWrapper } from '../../../test/queryClientWrapper'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useCreateTodoMutation } from './useCreateTodoMutation'

vi.mock('../api/todos', () => ({ todosApi: { create: vi.fn() } }))
beforeEach(() => vi.clearAllMocks())

const older = { ...todoFixture, id: 3, title: 'Older task' }

it('creates a task and puts it first in the cached list', async () => {
  const saved = { ...todoFixture, id: 8 }
  vi.mocked(todosApi.create).mockResolvedValue(saved)
  const { client, wrapper } = createQueryWrapper()
  client.setQueryData(todoKeys.list, [older])
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  await expect(result.current.mutateAsync(todoFixture)).resolves.toEqual(saved)
  expect(todosApi.create).toHaveBeenCalledWith(todoFixture)
  expect(client.getQueryData(todoKeys.list)).toEqual([saved, older])
})

it('starts the cache when no list is loaded and replaces a duplicate', async () => {
  vi.mocked(todosApi.create).mockResolvedValue(todoFixture)
  const { client, wrapper } = createQueryWrapper()
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  await result.current.mutateAsync(todoFixture)
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
  await result.current.mutateAsync(todoFixture)
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
})

it('cancels an in-flight list refetch so it cannot overwrite the new task', async () => {
  vi.mocked(todosApi.create).mockResolvedValue(todoFixture)
  const { client, wrapper } = createQueryWrapper()
  const cancelQueries = vi.spyOn(client, 'cancelQueries')
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  await result.current.mutateAsync(todoFixture)
  expect(cancelQueries).toHaveBeenCalledWith({ queryKey: todoKeys.list })
})

it('leaves the cache untouched when creation fails', async () => {
  vi.mocked(todosApi.create).mockRejectedValue(new Error('Invalid task.'))
  const { client, wrapper } = createQueryWrapper()
  client.setQueryData(todoKeys.list, [older])
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  await expect(result.current.mutateAsync(todoFixture)).rejects.toThrow(
    'Invalid task.',
  )
  expect(client.getQueryData(todoKeys.list)).toEqual([older])
})
