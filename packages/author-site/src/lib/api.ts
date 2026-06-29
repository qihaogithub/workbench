import useSWR, { mutate } from 'swr'
import type {
  ApiResponse,
  DemoMeta,
  ProjectTemplateMeta,
  SessionMeta,
} from '@opencode-workbench/shared'

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

export function useProjectTemplates() {
  const { data, error, isLoading, mutate: revalidate } = useSWR(
    '/api/templates',
    () => fetcher<ProjectTemplateMeta[]>('/api/templates'),
    {
      revalidateOnFocus: false,
    }
  )

  const templates = data?.success ? data.data : []
  const apiError = data?.success === false ? data.error : null

  return {
    templates,
    isLoading,
    error: error || apiError,
    revalidate,
  }
}

export async function createDemo(
  name: string,
  category?: string,
  templateId?: string,
): Promise<ApiResponse<DemoMeta>> {
  const response = await fetch('/api/demos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, category, templateId }),
  }).then((res) => res.json())

  if (response.success) {
    mutate('/api/demos')
  }

  return response
}

export async function duplicateDemo(
  id: string,
  input: { name: string; category?: string },
): Promise<ApiResponse<DemoMeta>> {
  const response = await fetch(`/api/demos/${id}/duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }).then((res) => res.json())

  if (response.success) {
    mutate('/api/demos')
  }

  return response
}

export async function updateDemo(
  id: string,
  input: { name?: string; category?: string },
): Promise<ApiResponse<{ id: string; name?: string; category?: string }>> {
  const response = await fetch(`/api/demos/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }).then((res) => res.json())

  if (response.success) {
    mutate('/api/demos')
  }

  return response
}

export async function saveDemoAsTemplate(
  id: string,
  input: { category: string; name: string; description: string },
): Promise<ApiResponse<ProjectTemplateMeta>> {
  const response = await fetch(`/api/demos/${id}/template`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }).then((res) => res.json())

  if (response.success) {
    mutate('/api/templates')
  }

  return response
}

export async function updateProjectTemplate(
  id: string,
  input: { name?: string; category?: string },
): Promise<ApiResponse<ProjectTemplateMeta>> {
  const response = await fetch(`/api/templates/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }).then((res) => res.json())

  if (response.success) {
    mutate('/api/templates')
  }

  return response
}

export async function deleteProjectTemplate(id: string): Promise<ApiResponse<void>> {
  const response = await fetch(`/api/templates/${id}`, {
    method: 'DELETE',
  }).then((res) => res.json())

  if (response.success) {
    mutate('/api/templates')
  }

  return response
}

export async function convertProjectTemplate(
  id: string,
): Promise<ApiResponse<DemoMeta>> {
  const response = await fetch(`/api/templates/${id}/convert`, {
    method: 'POST',
  }).then((res) => res.json())

  if (response.success) {
    mutate('/api/demos')
    mutate('/api/templates')
  }

  return response
}

export async function recommendProjectTemplate(
  description: string,
): Promise<ApiResponse<{
  templateId: string
  reason: string
  confidence: number
  template?: ProjectTemplateMeta
}>> {
  return fetch('/api/templates/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  }).then((res) => res.json())
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

export async function uploadTemplateCover(
  templateId: string,
  file: File,
): Promise<ApiResponse<{ thumbnail: string }>> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`/api/templates/${templateId}/cover`, {
    method: 'POST',
    body: formData,
  }).then((res) => res.json())

  if (response.success) {
    mutate('/api/templates')
  }

  return response
}

export async function deleteTemplateCover(
  templateId: string,
): Promise<ApiResponse<{ thumbnail: string | null }>> {
  const response = await fetch(`/api/templates/${templateId}/cover`, {
    method: 'DELETE',
  }).then((res) => res.json())

  if (response.success) {
    mutate('/api/templates')
  }

  return response
}
