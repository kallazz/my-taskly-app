import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useNotice } from './useNotice'

afterEach(() => vi.useRealTimers())

it('starts without a notice and exposes a notification callback', () => {
  const { result } = renderHook(() => useNotice())
  expect(result.current.message).toBe('')
  expect(result.current.notify).toEqual(expect.any(Function))
})

it('shows a notice and clears it after four seconds', () => {
  vi.useFakeTimers()
  const { result } = renderHook(() => useNotice())
  act(() => result.current.notify('Task created.'))
  expect(result.current.message).toBe('Task created.')
  act(() => vi.advanceTimersByTime(3999))
  expect(result.current.message).toBe('Task created.')
  act(() => vi.advanceTimersByTime(1))
  expect(result.current.message).toBe('')
})

it('restarts the timer for a new notice, even with the same text', () => {
  vi.useFakeTimers()
  const { result } = renderHook(() => useNotice())
  act(() => result.current.notify('Saved.'))
  act(() => vi.advanceTimersByTime(3000))
  act(() => result.current.notify('Saved.'))
  act(() => vi.advanceTimersByTime(3000))
  expect(result.current.message).toBe('Saved.')
  act(() => vi.advanceTimersByTime(1000))
  expect(result.current.message).toBe('')
})

it('keeps the notify callback stable and cancels the timer on unmount', () => {
  vi.useFakeTimers()
  const { result, rerender, unmount } = renderHook(() => useNotice())
  const notify = result.current.notify
  rerender()
  expect(result.current.notify).toBe(notify)
  act(() => notify('Task deleted.'))
  unmount()
  expect(vi.getTimerCount()).toBe(0)
})
