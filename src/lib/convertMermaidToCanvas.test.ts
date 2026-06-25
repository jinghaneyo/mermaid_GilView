import { describe, it, expect } from 'vitest'
import { convertMermaidToCanvas } from './convertMermaidToCanvas'

describe('convertMermaidToCanvas', () => {
  it('graph TD의 노드/엣지를 파싱한다', () => {
    const { nodes, edges } = convertMermaidToCanvas('graph TD\n  A[시작] --> B[종료]')
    expect(nodes.map((n) => n.id)).toEqual(['A', 'B'])
    expect(nodes.find((n) => n.id === 'A')!.data.label).toBe('시작')
    expect(nodes.find((n) => n.id === 'B')!.data.label).toBe('종료')
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({ source: 'A', target: 'B' })
  })

  it('엣지 라벨(-->|예|)을 파싱한다', () => {
    const { edges } = convertMermaidToCanvas('graph TD\n  A -->|예| B')
    expect(edges[0].label).toBe('예')
  })

  it('라벨이 없는 노드는 id를 라벨로 쓴다', () => {
    const { nodes } = convertMermaidToCanvas('graph TD\n  A --> B')
    expect(nodes.find((n) => n.id === 'A')!.data.label).toBe('A')
    expect(nodes.find((n) => n.id === 'B')!.data.label).toBe('B')
  })

  it('체인 문법(A --> B --> C)을 여러 엣지로 분해한다', () => {
    const { nodes, edges } = convertMermaidToCanvas('graph TD\n  A --> B --> C')
    expect(nodes.map((n) => n.id)).toEqual(['A', 'B', 'C'])
    expect(edges.map((e) => [e.source, e.target])).toEqual([
      ['A', 'B'],
      ['B', 'C'],
    ])
  })

  it('{} 와 () 모양 노드의 라벨을 파싱한다', () => {
    const { nodes } = convertMermaidToCanvas('graph TD\n  A{조건} --> B(처리)')
    expect(nodes.find((n) => n.id === 'A')!.data.label).toBe('조건')
    expect(nodes.find((n) => n.id === 'B')!.data.label).toBe('처리')
  })

  it('단독 노드 선언 줄과, 이후 엣지의 라벨 보강을 처리한다', () => {
    const { nodes, edges } = convertMermaidToCanvas('graph TD\n  A[시작]\n  A --> B[끝]')
    expect(nodes.map((n) => n.id)).toEqual(['A', 'B'])
    expect(nodes.find((n) => n.id === 'A')!.data.label).toBe('시작')
    expect(edges).toHaveLength(1)
  })

  it('주석(%%)과 빈 줄은 무시한다', () => {
    const { nodes, edges } = convertMermaidToCanvas(
      'graph TD\n\n  %% 주석\n  A --> B\n',
    )
    expect(nodes.map((n) => n.id)).toEqual(['A', 'B'])
    expect(edges).toHaveLength(1)
  })

  it('모든 노드에 겹치지 않는 좌표를 부여한다', () => {
    const { nodes } = convertMermaidToCanvas(
      'graph TD\n  A --> B\n  B --> C\n  C --> D\n  D --> E',
    )
    expect(nodes).toHaveLength(5)
    const seen = new Set<string>()
    for (const n of nodes) {
      expect(Number.isFinite(n.position.x)).toBe(true)
      expect(Number.isFinite(n.position.y)).toBe(true)
      const key = `${n.position.x},${n.position.y}`
      expect(seen.has(key)).toBe(false) // 좌표 중복 없음
      seen.add(key)
    }
  })

  it('빈 입력은 빈 nodes/edges를 반환한다', () => {
    const { nodes, edges } = convertMermaidToCanvas('')
    expect(nodes).toEqual([])
    expect(edges).toEqual([])
  })
})
