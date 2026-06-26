import { describe, it, expect } from 'vitest'
import { convertCanvasToMermaid } from './MermaidVisualEditor'

describe('MermaidVisualEditor: convertCanvasToMermaid (canvas -> code)', () => {
  it('graph TD 헤더와 노드 라벨, 엣지를 출력한다', () => {
    const nodes = [
      { id: 'A', data: { label: '시작' }, position: { x: 0, y: 0 } },
      { id: 'B', data: { label: '종료' }, position: { x: 0, y: 0 } },
    ]
    const edges = [{ id: 'A-B', source: 'A', target: 'B' }]
    expect(convertCanvasToMermaid(nodes, edges)).toBe(
      'graph TD\n  A[시작]\n  B[종료]\n  A --> B',
    )
  })

  it('엣지 라벨이 있으면 A -->|라벨| B 로 출력한다', () => {
    const nodes = [
      { id: 'A', data: { label: '조건' }, position: { x: 0, y: 0 } },
      { id: 'B', data: { label: '처리' }, position: { x: 0, y: 0 } },
    ]
    const edges = [{ id: 'A-B', source: 'A', target: 'B', label: '예' }]
    expect(convertCanvasToMermaid(nodes, edges)).toBe(
      'graph TD\n  A[조건]\n  B[처리]\n  A -->|예| B',
    )
  })

  it('라벨이 비면 노드 ID를 라벨로 쓴다', () => {
    const nodes = [{ id: 'X', data: { label: '' }, position: { x: 0, y: 0 } }]
    expect(convertCanvasToMermaid(nodes, [])).toBe('graph TD\n  X[X]')
  })
})

describe('MermaidVisualEditor: safe Mermaid labels', () => {
  it('quotes node labels that include Mermaid shape syntax characters', () => {
    const nodes = [
      {
        id: 'main',
        data: { label: 'main() (진입점/설정파싱2)' },
        position: { x: 0, y: 0 },
      },
    ]

    expect(convertCanvasToMermaid(nodes, [])).toBe(
      'graph TD\n  main["main() (진입점/설정파싱2)"]',
    )
  })
})
