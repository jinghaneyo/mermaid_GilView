import { describe, it, expect } from 'vitest'
import { convertCanvasToMermaid } from './convertCanvasToMermaid'
import type { FlowNode, FlowEdge } from './types'

const node = (id: string, label: string): FlowNode => ({
  id,
  data: { label },
  position: { x: 0, y: 0 },
})

describe('convertCanvasToMermaid', () => {
  it('첫 줄은 항상 graph TD다', () => {
    const out = convertCanvasToMermaid([], [])
    expect(out.split('\n')[0]).toBe('graph TD')
  })

  it('노드를 ID[라벨] 형태로 변환한다', () => {
    const out = convertCanvasToMermaid([node('A', '시작'), node('B', '종료')], [])
    expect(out).toBe('graph TD\n  A[시작]\n  B[종료]')
  })

  it('엣지를 source --> target 형태로 변환한다', () => {
    const nodes = [node('A', '시작'), node('B', '종료')]
    const edges: FlowEdge[] = [{ id: 'A-B', source: 'A', target: 'B' }]
    const out = convertCanvasToMermaid(nodes, edges)
    expect(out).toBe('graph TD\n  A[시작]\n  B[종료]\n  A --> B')
  })

  it('라벨이 있는 엣지는 source -->|라벨| target 형태로 변환한다', () => {
    const nodes = [node('A', '조건'), node('B', '처리')]
    const edges: FlowEdge[] = [{ id: 'A-B', source: 'A', target: 'B', label: '예' }]
    const out = convertCanvasToMermaid(nodes, edges)
    expect(out).toBe('graph TD\n  A[조건]\n  B[처리]\n  A -->|예| B')
  })

  it('결과는 줄바꿈으로 구분된 단일 문자열이다', () => {
    const out = convertCanvasToMermaid([node('A', 'a')], [])
    expect(typeof out).toBe('string')
    expect(out.split('\n')).toEqual(['graph TD', '  A[a]'])
  })

  it('빈 라벨이면 노드 ID를 라벨로 사용한다', () => {
    const out = convertCanvasToMermaid(
      [{ id: 'X', data: { label: '' }, position: { x: 0, y: 0 } }],
      [],
    )
    expect(out).toBe('graph TD\n  X[X]')
  })
})
