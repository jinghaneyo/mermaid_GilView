import { describe, it, expect } from 'vitest'
import {
  convertMermaidToCanvas,
  convertCanvasToMermaid,
} from './MermaidVisualEditor'

describe('MermaidVisualEditor 통합 변환 함수', () => {
  it('초기 코드(graph TD\\nA[시작] --> B[종료])를 노드 2개·엣지 1개로 변환한다', () => {
    const { nodes, edges } = convertMermaidToCanvas('graph TD\nA[시작] --> B[종료]')
    expect(nodes.map((n) => n.id)).toEqual(['A', 'B'])
    expect(nodes.find((n) => n.id === 'A').data.label).toBe('시작')
    expect(nodes.find((n) => n.id === 'B').data.label).toBe('종료')
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({ source: 'A', target: 'B' })
    // 좌표가 겹치지 않게 부여됨
    expect(nodes[0].position).not.toEqual(nodes[1].position)
  })

  it('canvas -> code 는 graph TD 헤더와 라벨/엣지를 출력한다', () => {
    const nodes = [
      { id: 'A', data: { label: '시작' }, position: { x: 0, y: 0 } },
      { id: 'B', data: { label: '종료' }, position: { x: 0, y: 0 } },
    ]
    const edges = [{ id: 'A-B', source: 'A', target: 'B', label: '예' }]
    expect(convertCanvasToMermaid(nodes, edges)).toBe(
      'graph TD\n  A[시작]\n  B[종료]\n  A -->|예| B',
    )
  })

  it('code -> canvas -> code 라운드트립이 구조를 보존한다', () => {
    const { nodes, edges } = convertMermaidToCanvas(
      'graph TD\n  A[시작] -->|예| B[종료]',
    )
    const code = convertCanvasToMermaid(nodes, edges)
    expect(code).toBe('graph TD\n  A[시작]\n  B[종료]\n  A -->|예| B')
  })
})
