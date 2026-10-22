import { render, screen } from '@testing-library/react'
import { QueryClient, useQueryClient } from '@tanstack/react-query'
import { useTheme } from 'styled-components'
import { expect, it, vi } from 'vitest'
import { GlobalStyles, theme } from '../design-system'
import { queryClient } from '../lib/queryClient'
import { AppProviders } from './AppProviders'

vi.mock('../design-system', () => import('../design-system/mocks'))

function Probe({ onRender }: { onRender: (client: QueryClient) => void }) {
  onRender(useQueryClient())
  return <p>{useTheme() === theme ? 'Themed' : 'Unthemed'}</p>
}

it('provides the shared query client, theme and global styles', () => {
  const onRender = vi.fn()
  render(
    <AppProviders>
      <Probe onRender={onRender} />
    </AppProviders>,
  )
  expect(screen.getByText('Themed')).toBeVisible()
  expect(onRender).toHaveBeenCalledWith(queryClient)
  expect(GlobalStyles).toHaveBeenCalled()
})

it('accepts a custom query client', () => {
  const client = new QueryClient()
  const onRender = vi.fn()
  render(
    <AppProviders client={client}>
      <Probe onRender={onRender} />
    </AppProviders>,
  )
  expect(onRender).toHaveBeenCalledWith(client)
})
