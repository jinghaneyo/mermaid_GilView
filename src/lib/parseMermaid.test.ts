import { describe, it, expect } from 'vitest'
import { parseMermaid } from './parseMermaid'

describe('parseMermaid', () => {
  it('flowchart TD의 노드와 엣지를 추출한다', async () => {
    const { graph, error } = await parseMermaid('graph TD\n  A[Start] --> B[End]')
    expect(error).toBeNull()
    expect(graph).not.toBeNull()
    expect(graph!.direction).toBe('TB')
    expect(graph!.nodes.map((n) => n.id).sort()).toEqual(['A', 'B'])
    const a = graph!.nodes.find((n) => n.id === 'A')!
    expect(a.label).toBe('Start')
    expect(graph!.edges).toHaveLength(1)
    expect(graph!.edges[0]).toMatchObject({ source: 'A', target: 'B' })
  })

  it('LR 방향을 인식한다', async () => {
    const { graph } = await parseMermaid('graph LR\n  A --> B')
    expect(graph!.direction).toBe('LR')
  })

  it('엣지 라벨을 추출한다', async () => {
    const { graph } = await parseMermaid('graph TD\n  A -->|yes| B')
    expect(graph!.edges[0].label).toBe('yes')
  })

  it('빈 입력은 빈 그래프를 반환하고 에러가 없다', async () => {
    const { graph, error } = await parseMermaid('   ')
    expect(error).toBeNull()
    expect(graph).toEqual({ nodes: [], edges: [], direction: 'TB' })
  })

  it('잘못된 문법은 에러 메시지를 반환한다', async () => {
    const { graph, error } = await parseMermaid('graph TD\n  A --> ')
    expect(graph).toBeNull()
    expect(error).toBeTruthy()
  })

  it('지원하지 않는 다이어그램 타입은 안내 에러를 반환한다', async () => {
    const { graph, error } = await parseMermaid('sequenceDiagram\n  Alice->>Bob: Hi')
    expect(graph).toBeNull()
    expect(error).toContain('flowchart')
  })
  it('converts Mermaid br markup in node labels to editable newlines', async () => {
    const { graph, error } = await parseMermaid(
      'graph TD\n  A["First<br/>Second"] --> B[End]',
    )

    expect(error).toBeNull()
    expect(graph!.nodes.find((n) => n.id === 'A')!.label).toBe('First\nSecond')
  })
})
