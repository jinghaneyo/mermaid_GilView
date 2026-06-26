import { describe, it, expect } from 'vitest'
import { layout } from './layout'
import type { ParsedGraph } from './types'

const base: ParsedGraph = {
  direction: 'TB',
  nodes: [
    { id: 'A', label: 'Start' },
    { id: 'B', label: 'End' },
  ],
  edges: [{ id: 'A-B', source: 'A', target: 'B' }],
}

describe('layout', () => {
  it('모든 노드에 좌표를 부여한다', () => {
    const { nodes } = layout(base)
    expect(nodes).toHaveLength(2)
    nodes.forEach((n) => {
      expect(typeof n.position.x).toBe('number')
      expect(typeof n.position.y).toBe('number')
      expect(Number.isFinite(n.position.x)).toBe(true)
      expect(Number.isFinite(n.position.y)).toBe(true)
    })
  })

  it('TB 방향에서 target 노드가 source 아래에 배치된다', () => {
    const { nodes } = layout(base)
    const a = nodes.find((n) => n.id === 'A')!
    const b = nodes.find((n) => n.id === 'B')!
    expect(b.position.y).toBeGreaterThan(a.position.y)
  })

  it('LR 방향에서 target 노드가 source 오른쪽에 배치된다', () => {
    const { nodes } = layout({ ...base, direction: 'LR' })
    const a = nodes.find((n) => n.id === 'A')!
    const b = nodes.find((n) => n.id === 'B')!
    expect(b.position.x).toBeGreaterThan(a.position.x)
  })

  it('엣지를 그대로 전달하며 라벨을 보존한다', () => {
    const { edges } = layout({
      ...base,
      edges: [{ id: 'A-B', source: 'A', target: 'B', label: 'yes' }],
    })
    expect(edges).toEqual([{ id: 'A-B', source: 'A', target: 'B', label: 'yes' }])
  })
})

describe('layout text width options', () => {
  it('expands node width for long labels when fitNodeWidthToText is enabled', () => {
    const { nodes } = layout(
      {
        direction: 'TB',
        nodes: [{ id: 'A', label: 'A very long process label that needs more room' }],
        edges: [],
      },
      { fitNodeWidthToText: true },
    )

    expect(nodes[0].width).toBeGreaterThan(160)
  })
})
