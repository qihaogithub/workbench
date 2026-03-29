import useSWR, { mutate } from 'swr'
import type { DemoMeta, ApiResponse } from '@opencode-workbench/shared'
import { getMockDemos, createMockDemo, deleteMockDemo } from './mock-api'

type Fetcher<T> = () => Promise<ApiResponse<T>>

const defaultFetcher: Fetcher<DemoMeta[]> = getMockDemos

export function useDemos(fetcher: Fetcher<DemoMeta[]> = defaultFetcher) {
  const { data, error, isLoading, mutate: revalidate } = useSWR(
    '/api/demos',
    fetcher,
    {
      revalidateOnFocus: false,
    }
  )

  const demos = data?.success ? data.data : []
  const apiError = data?.success === false ? data.error : null

  return {
    demos,
    isLoading,
    error: error || apiError,
    revalidate,
  }
}

export async function createDemo(
  name: string,
  useMock: boolean = true
): Promise<ApiResponse<DemoMeta>> {
  const response = useMock
    ? await createMockDemo(name)
    : await fetch('/api/demos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }).then((res) => res.json())

  if (response.success) {
    mutate('/api/demos')
  }

  return response
}

export async function deleteDemo(
  id: string,
  useMock: boolean = true
): Promise<ApiResponse<void>> {
  const response = useMock
    ? await deleteMockDemo(id)
    : await fetch(`/api/demos/${id}`, {
        method: 'DELETE',
      }).then((res) => res.json())

  if (response.success) {
    mutate('/api/demos')
  }

  return response
}
