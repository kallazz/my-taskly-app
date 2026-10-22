import { act, renderHook, waitFor } from '@testing-library/react'
import { useMutation } from '@tanstack/react-query'
import { expect, it } from 'vitest'
import { createQueryWrapper } from '../../../test/queryClientWrapper'
import { todoKeys } from '../api/queryKeys'
import { useTodosBusy } from './useTodosBusy'

function useBusyWithMutation(mutationKey: readonly string[]) {
  const mutation = useMutation({
    mutationKey,
    mutationFn: (pending: Promise<void>) => pending,
  })
  return { busy: useTodosBusy(), mutation }
}

it.each([[todoKeys.create], [todoKeys.update], [todoKeys.delete]])(
  'is busy while a %j mutation is pending',
  async (mutationKey) => {
    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useBusyWithMutation(mutationKey), {
      wrapper,
    })
    expect(result.current.busy).toBe(false)
    let finish = () => {}
    const pending = new Promise<void>((resolve) => (finish = resolve))
    act(() => result.current.mutation.mutate(pending))
    await waitFor(() => expect(result.current.busy).toBe(true))
    await act(async () => finish())
    await waitFor(() => expect(result.current.busy).toBe(false))
  },
)

it('ignores mutations outside the todos feature', async () => {
  const { wrapper } = createQueryWrapper()
  const { result } = renderHook(() => useBusyWithMutation(['settings']), {
    wrapper,
  })
  act(() => result.current.mutation.mutate(new Promise<void>(() => {})))
  await waitFor(() => expect(result.current.mutation.isPending).toBe(true))
  expect(result.current.busy).toBe(false)
})
