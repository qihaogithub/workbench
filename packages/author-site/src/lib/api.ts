import useSWR, { mutate } from 'swr'
import type { DemoMeta, ApiResponse, SessionMeta } from '@opencode-workbench/shared'

// 真实 API 调用
const fetcher = async <T>(url: string): Promise<ApiResponse<T>> => {
  const res = await fetch(url)
  return res.json()
}

export function useDemos(options?: { fallbackData?: DemoMeta[] }) {
  const { data, error, isLoading, mutate: revalidate } = useSWR(
    '/api/demos',
    () => fetcher<DemoMeta[]>('/api/demos'),
    {
      revalidateOnFocus: false,
      fallbackData: options?.fallbackData
        ? { success: true as const, data: options.fallbackData }
        : undefined,
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

export async function createDemo(name: string): Promise<ApiResponse<DemoMeta>> {
  const response = await fetch('/api/demos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  }).then((res) => res.json())

  if (response.success) {
    mutate('/api/demos')
  }

  return response
}

export async function deleteDemo(id: string): Promise<ApiResponse<void>> {
  const response = await fetch(`/api/demos/${id}`, {
    method: 'DELETE',
  }).then((res) => res.json())

  if (response.success) {
    mutate('/api/demos')
  }

  return response
}

// Session API
export async function createSession(demoId: string): Promise<ApiResponse<SessionMeta>> {
  return fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ demoId }),
  }).then((res) => res.json())
}

export async function deleteSession(sessionId: string): Promise<ApiResponse<void>> {
  return fetch(`/api/sessions/${sessionId}`, {
    method: 'DELETE',
  }).then((res) => res.json())
}

export async function uploadCover(
  projectId: string,
  file: File,
): Promise<ApiResponse<{ thumbnail: string }>> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`/api/demos/${projectId}/cover`, {
    method: 'POST',
    body: formData,
  }).then((res) => res.json())

  if (response.success) {
    mutate('/api/demos')
  }

  return response
}

export async function deleteCover(
  projectId: string,
): Promise<ApiResponse<{ thumbnail: string | null }>> {
  const response = await fetch(`/api/demos/${projectId}/cover`, {
    method: 'DELETE',
  }).then((res) => res.json())

  if (response.success) {
    mutate('/api/demos')
  }

  return response
}
