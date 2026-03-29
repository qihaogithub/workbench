import type { DemoMeta, ApiResponse } from '@opencode-workbench/shared'

const mockDemos: DemoMeta[] = [
  {
    id: 'demo-1',
    name: '活动 Banner',
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now(),
    thumbnail: '/thumbnails/demo-1.png',
  },
  {
    id: 'demo-2',
    name: '商品卡片',
    createdAt: Date.now() - 172800000,
    updatedAt: Date.now() - 3600000,
  },
  {
    id: 'demo-3',
    name: '促销弹窗',
    createdAt: Date.now() - 259200000,
    updatedAt: Date.now() - 7200000,
    thumbnail: '/thumbnails/demo-3.png',
  },
]

export function getMockDemos(): Promise<ApiResponse<DemoMeta[]>> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        success: true,
        data: mockDemos,
      })
    }, 300)
  })
}

export function createMockDemo(name: string): Promise<ApiResponse<DemoMeta>> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const newDemo: DemoMeta = {
        id: `demo-${Date.now()}`,
        name,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      mockDemos.push(newDemo)
      resolve({
        success: true,
        data: newDemo,
      })
    }, 300)
  })
}

export function deleteMockDemo(id: string): Promise<ApiResponse<void>> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const index = mockDemos.findIndex((d) => d.id === id)
      if (index === -1) {
        resolve({
          success: false,
          error: {
            code: 'DEMO_NOT_FOUND',
            message: 'Demo 不存在',
          },
        })
        return
      }
      mockDemos.splice(index, 1)
      resolve({
        success: true,
        data: undefined as unknown as void,
      })
    }, 300)
  })
}
