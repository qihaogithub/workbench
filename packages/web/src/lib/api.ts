import useSWR, { mutate } from 'swr'
import type { DemoMeta, ApiResponse, DemoFiles, SessionMeta } from '@opencode-workbench/shared'

// 真实 API 调用
const fetcher = async <T>(url: string): Promise<ApiResponse<T>> => {
  const res = await fetch(url)
  return res.json()
}

export function useDemos() {
  const { data, error, isLoading, mutate: revalidate } = useSWR(
    '/api/demos',
    () => fetcher<DemoMeta[]>('/api/demos'),
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

export async function getSessionFiles(sessionId: string): Promise<ApiResponse<DemoFiles>> {
  return fetch(`/api/sessions/${sessionId}/files`).then((res) => res.json())
}

export async function saveSessionFiles(
  sessionId: string,
  files: DemoFiles
): Promise<ApiResponse<void>> {
  return fetch(`/api/sessions/${sessionId}/files`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(files),
  }).then((res) => res.json())
}

export async function mergeSession(sessionId: string): Promise<ApiResponse<void>> {
  return fetch(`/api/sessions/${sessionId}/merge`, {
    method: 'POST',
  }).then((res) => res.json())
}

export async function deleteSession(sessionId: string): Promise<ApiResponse<void>> {
  return fetch(`/api/sessions/${sessionId}`, {
    method: 'DELETE',
  }).then((res) => res.json())
}
