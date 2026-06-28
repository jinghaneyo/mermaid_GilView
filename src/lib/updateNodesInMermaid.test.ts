import { describe, expect, it } from 'vitest'
import { addNodeToMermaid } from './updateNodesInMermaid'

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
})
