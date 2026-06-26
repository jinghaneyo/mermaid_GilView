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
})
