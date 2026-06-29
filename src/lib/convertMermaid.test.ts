import { describe, it, expect } from 'vitest'
import { convertMermaid } from './convertMermaid'

describe('convertMermaid', () => {
  it('유효한 flowchart를 좌표 있는 노드/엣지로 변환한다', async () => {
    const res = await convertMermaid('graph TD\n  A[Start] --> B[End]')
    expect(res.error).toBeNull()
    expect(res.nodes).toHaveLength(2)
    expect(res.edges).toHaveLength(1)
    expect(Number.isFinite(res.nodes[0].position.x)).toBe(true)
  })

  it('converts sequence diagrams to positioned participants and labeled messages', async () => {
    const res = await convertMermaid(
      [
        'sequenceDiagram',
        '  participant A as Alice',
        '  participant B as Bob',
        '  A->>B: Hello',
      ].join('\n'),
    )

    expect(res.error).toBeNull()
    expect(res.nodes.map((node) => [node.id, node.data.label])).toEqual([
      ['A', 'Alice'],
      ['B', 'Bob'],
    ])
    expect(res.edges).toEqual([
      { id: 'A-B-0', source: 'A', target: 'B', label: 'Hello' },
    ])
    expect(Number.isFinite(res.nodes[0].position.x)).toBe(true)
  })

  it('converts sequence diagrams with autonumber and loop control records', async () => {
    const res = await convertMermaid(
      [
        'sequenceDiagram',
        '  autonumber',
        '  loop Every minute',
        '    Alice->>Bob: Ping',
        '  end',
      ].join('\n'),
    )

    expect(res.error).toBeNull()
    expect(res.nodes.map((node) => node.id)).toEqual(['Alice', 'Bob'])
    expect(res.edges).toEqual([
      { id: 'Alice-Bob-0', source: 'Alice', target: 'Bob', label: 'Ping' },
    ])
  })

  it('빈 입력은 빈 결과, 에러 없음', async () => {
    const res = await convertMermaid('')
    expect(res).toEqual({ nodes: [], edges: [], error: null, groups: [] })
  })

  it('subgraph가 있으면 그룹 박스를 계산해 반환한다', async () => {
    const res = await convertMermaid(
      'graph TD\n  subgraph Boot\n    A[main] --> B[start]\n  end',
    )
    expect(res.error).toBeNull()
    expect(res.groups).toHaveLength(1)
    expect(res.groups![0].label).toBe('Boot')
    expect(res.groups![0].width).toBeGreaterThan(0)
    expect(res.groups![0].height).toBeGreaterThan(0)
    expect(res.groups![0].nodeIds).toEqual(expect.arrayContaining(['A', 'B']))
  })

  it('잘못된 문법은 에러를 담고 노드/엣지는 비운다', async () => {
    const res = await convertMermaid('graph TD\n  A --> ')
    expect(res.error).toBeTruthy()
    expect(res.nodes).toEqual([])
    expect(res.edges).toEqual([])
  })
  it('applies gilview node size comments to converted nodes', async () => {
    const res = await convertMermaid(
      'graph TD\n%% gilview:node A width=260 height=120\n  A[Start]',
    )

    expect(res.error).toBeNull()
    expect(res.nodes[0].width).toBe(260)
    expect(res.nodes[0].height).toBe(120)
  })

  it('applies gilview subgraph size comments to converted groups', async () => {
    const res = await convertMermaid(
      'graph TD\n%% gilview:subgraph Boot width=500 height=280\nsubgraph Boot\n  A[Start]\nend',
    )

    expect(res.error).toBeNull()
    expect(res.groups![0].width).toBe(500)
    expect(res.groups![0].height).toBe(280)
    expect(res.groups![0].customSize).toBe(true)
  })

  it('keeps subgraph boxes compact when members connect through external nodes', async () => {
    const res = await convertMermaid(
      [
        'flowchart TB',
        '  subgraph G["Grouped work"]',
        '    A[First member]',
        '    B[Second member]',
        '  end',
        '  A --> X1[External 1] --> X2[External 2] --> B',
      ].join('\n'),
    )

    expect(res.error).toBeNull()
    const group = res.groups![0]
    expect(group.height).toBeLessThan(220)
  })
})
