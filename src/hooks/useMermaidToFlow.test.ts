import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMermaidToFlow } from './useMermaidToFlow'
import type { ConvertResult } from '../lib/types'

vi.mock('../lib/convertMermaid', () => ({
  convertMermaid: vi.fn(),
}))
import { convertMermaid } from '../lib/convertMermaid'
const mockConvert = vi.mocked(convertMermaid)

const ok = (label: string): ConvertResult => ({
  nodes: [{ id: 'A', data: { label }, position: { x: 0, y: 0 } }],
  edges: [],
  error: null,
})

beforeEach(() => {
  vi.useFakeTimers()
  mockConvert.mockReset()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useMermaidToFlow', () => {
  it('디바운스 후 변환 결과를 반영한다', async () => {
    mockConvert.mockResolvedValue(ok('Start'))
    const { result } = renderHook(() => useMermaidToFlow('graph TD\n A[Start]', 250))

    expect(mockConvert).not.toHaveBeenCalled() // 디바운스 전 호출 없음

    // Advance fake timers and flush all pending promises in one act
    await act(async () => {
      await vi.runAllTimersAsync()
    })

    expect(result.current.nodes).toHaveLength(1)
    expect(result.current.nodes[0].data.label).toBe('Start')
  })

  it('파싱 에러 시 이전 정상 노드를 유지한다', async () => {
    mockConvert.mockResolvedValueOnce(ok('Start'))
    const { result, rerender } = renderHook(({ code }) => useMermaidToFlow(code, 250), {
      initialProps: { code: 'graph TD\n A[Start]' },
    })

    await act(async () => {
      await vi.runAllTimersAsync()
    })

    expect(result.current.nodes).toHaveLength(1)

    mockConvert.mockResolvedValueOnce({ nodes: [], edges: [], error: 'Parse error' })
    rerender({ code: 'graph TD\n A --> ' })

    await act(async () => {
      await vi.runAllTimersAsync()
    })

    expect(result.current.error).toBe('Parse error')
    // 이전 정상 그래프 유지
    expect(result.current.nodes).toHaveLength(1)
  })
})
