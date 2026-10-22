import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { request } from './http'

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => vi.stubGlobal('fetch', fetchMock))
afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

it('prefixes the API path, sends JSON headers and returns the parsed body', async () => {
  fetchMock.mockResolvedValue(jsonResponse(200, [{ id: 1 }]))
  await expect(
    request('/todos', { method: 'POST', headers: { 'X-Trace': 'abc' } }),
  ).resolves.toEqual([{ id: 1 }])
  expect(fetchMock).toHaveBeenCalledWith('/api/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Trace': 'abc' },
  })
})

it('returns undefined for 204 No Content', async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
  await expect(request('/todos/7', { method: 'DELETE' })).resolves.toBe(
    undefined,
  )
})

it('reports network failures with a friendly message', async () => {
  fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
  await expect(request('/todos')).rejects.toThrow(
    'Cannot connect to the server. Please try again.',
  )
})

it('rethrows the original error when the request was aborted', async () => {
  const controller = new AbortController()
  controller.abort()
  const abortError = new DOMException('Aborted', 'AbortError')
  fetchMock.mockRejectedValue(abortError)
  await expect(request('/todos', { signal: controller.signal })).rejects.toBe(
    abortError,
  )
})

it('explains validation limits for 422 responses', async () => {
  fetchMock.mockResolvedValue(jsonResponse(422, { detail: [{ msg: 'bad' }] }))
  await expect(request('/todos')).rejects.toThrow(
    'Check the task details: title up to 120 characters, description up to 2000 characters, and a valid due date.',
  )
})

it('uses the server detail message for other errors', async () => {
  fetchMock.mockResolvedValue(jsonResponse(404, { detail: 'Task not found.' }))
  await expect(request('/todos/404')).rejects.toThrow('Task not found.')
})

it.each([
  ['a non-string detail', jsonResponse(500, { detail: { code: 1 } })],
  ['a body that is not JSON', new Response('Bad gateway', { status: 502 })],
])('falls back to a generic message for %s', async (_, response) => {
  fetchMock.mockResolvedValue(response)
  await expect(request('/todos')).rejects.toThrow(
    'The operation failed. Please try again.',
  )
})
