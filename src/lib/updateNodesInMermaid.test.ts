import { describe, expect, it } from 'vitest'
import { addNodeToMermaid, addNodeToMermaidWithId } from './updateNodesInMermaid'

describe('updateNodesInMermaid', () => {
  it('adds a rectangle node after the flowchart header', () => {
    const code = 'flowchart LR\n  A[Start]'

    expect(addNodeToMermaid(code, { shape: 'rect', label: 'New node' })).toBe(
      'flowchart LR\n  N1[New node]\n  A[Start]',
    )
  })

  it('generates the next unused node id', () => {
    const code = 'graph TD\n  N1[One]\n  N2[Two]\n  A --> N3[Three]'

    expect(addNodeToMermaid(code, { shape: 'diamond', label: 'Decision' })).toBe(
      'graph TD\n  N4{Decision}\n  N1[One]\n  N2[Two]\n  A --> N3[Three]',
    )
  })

  it('uses Mermaid syntax for supported node shapes', () => {
    const code = 'graph TD'

    expect(addNodeToMermaid(code, { shape: 'cylinder', label: 'Data' })).toBe(
      'graph TD\n  N1[(Data)]',
    )
    expect(addNodeToMermaid(code, { shape: 'stadium', label: 'Start' })).toBe(
      'graph TD\n  N1([Start])',
    )
    expect(addNodeToMermaid(code, { shape: 'circle', label: 'End' })).toBe(
      'graph TD\n  N1((End))',
    )
  })

  it('quotes labels that need Mermaid escaping', () => {
    const code = 'graph TD'

    expect(addNodeToMermaid(code, { shape: 'rect', label: 'main()' })).toBe(
      'graph TD\n  N1["main()"]',
    )
  })

  it('returns the generated node id with the updated Mermaid code', () => {
    const code = 'graph TD\n  N1[One]'

    expect(addNodeToMermaidWithId(code, { shape: 'rect', label: 'Next' })).toEqual({
      id: 'N2',
      code: 'graph TD\n  N2[Next]\n  N1[One]',
    })
  })

  it('inserts a new node below the anchor node line when an anchor is provided', () => {
    const code = 'graph TD\n  A[Start]\n  B[End]'

    expect(
      addNodeToMermaidWithId(code, {
        shape: 'rect',
        label: 'Next',
        anchorNodeId: 'A',
      }),
    ).toEqual({
      id: 'N1',
      code: 'graph TD\n  A[Start]\n  N1[Next]\n  B[End]',
    })
  })

  it('uses the same indentation depth as the anchor node line', () => {
    const code = [
      'graph TD',
      '  subgraph COORD["Coordinator"]',
      '    SNAP["kalman.SnapshotAll()<br/>(predicted 상태)"]',
      '    FUSE["jpda.Fuse()"]',
      '  end',
    ].join('\n')

    expect(
      addNodeToMermaidWithId(code, {
        shape: 'rect',
        label: '새 노드',
        anchorNodeId: 'SNAP',
      }),
    ).toEqual({
      id: 'N1',
      code: [
        'graph TD',
        '  subgraph COORD["Coordinator"]',
        '    SNAP["kalman.SnapshotAll()<br/>(predicted 상태)"]',
        '    N1[새 노드]',
        '    FUSE["jpda.Fuse()"]',
        '  end',
      ].join('\n'),
    })
  })
})
