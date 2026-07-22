import {
  INITIAL_PREVIEW_REQUEST_STATE,
  previewRequestReducer,
} from '@workbench/demo-ui'

describe('预览请求生命周期', () => {
  it('按编译、shell、渲染和提交阶段进入成功终态', () => {
    let state = INITIAL_PREVIEW_REQUEST_STATE

    state = previewRequestReducer(state, { type: 'START', requestId: 7 })
    expect(state.phase).toBe('compiling')

    state = previewRequestReducer(state, {
      type: 'COMPILED',
      requestId: 7,
      shellReady: false,
    })
    expect(state.phase).toBe('waiting-shell')

    state = previewRequestReducer(state, { type: 'RENDERING', requestId: 7 })
    expect(state.phase).toBe('rendering')

    state = previewRequestReducer(state, { type: 'READY', requestId: 7 })
    expect(state.phase).toBe('ready')
  })

  it.each([
    [{ type: 'FAIL', requestId: 3, error: '编译失败' } as const, 'failed'],
    [{ type: 'TIMEOUT', requestId: 3, error: '渲染超时' } as const, 'timed-out'],
    [{ type: 'CANCEL', requestId: 3 } as const, 'cancelled'],
  ])('将 %s 收敛为唯一终态 %s', (action, phase) => {
    const started = previewRequestReducer(INITIAL_PREVIEW_REQUEST_STATE, {
      type: 'START',
      requestId: 3,
    })

    expect(previewRequestReducer(started, action).phase).toBe(phase)
  })

  it('忽略旧请求的迟到事件和成功后的阶段回退', () => {
    const current = previewRequestReducer(INITIAL_PREVIEW_REQUEST_STATE, {
      type: 'START',
      requestId: 8,
    })
    const afterOldEvent = previewRequestReducer(current, {
      type: 'READY',
      requestId: 7,
    })
    expect(afterOldEvent).toBe(current)

    const ready = previewRequestReducer(current, { type: 'READY', requestId: 8 })
    expect(
      previewRequestReducer(ready, { type: 'RENDERING', requestId: 8 }).phase
    ).toBe('ready')
  })
})
