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
    expect(res).toEqual({ nodes: [], edges: [], error: null })
  })

  it('잘못된 문법은 에러를 담고 노드/엣지는 비운다', async () => {
    const res = await convertMermaid('graph TD\n  A --> ')
    expect(res.error).toBeTruthy()
    expect(res.nodes).toEqual([])
    expect(res.edges).toEqual([])
  })
})
