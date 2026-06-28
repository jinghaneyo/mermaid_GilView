import { describe, expect, it } from 'vitest'
import {
  addEdgeToMermaid,
  removeSelectionFromMermaid,
  updateEdgeLabelInMermaid,
} from './updateEdgesInMermaid'

describe('updateEdgesInMermaid', () => {
  it('adds an edge without regenerating the diagram header or existing content', () => {
    const code = [
      'flowchart LR',
      '  %% keep this comment',
      '  A[Start]',
      '  B[End]',
    ].join('\n')

    expect(addEdgeToMermaid(code, { source: 'A', target: 'B' })).toBe(
      [
        'flowchart LR',
        '  %% keep this comment',
        '  A[Start]',
        '  B[End]',
        '  A --> B',
      ].join('\n'),
    )
  })

  it('updates an existing edge label in place', () => {
    const code = 'flowchart TD\n  A --> B\n  A -->|old| C'

    expect(
      updateEdgeLabelInMermaid(code, {
        source: 'A',
        target: 'C',
        label: 'new',
      }),
    ).toBe('flowchart TD\n  A --> B\n  A -->|new| C')
  })

  it('removes a selected edge while preserving unrelated lines', () => {
    const code = 'flowchart TD\n  A[Start]\n  B[End]\n  A --> B\n  B --> C[Next]'

    expect(
      removeSelectionFromMermaid(code, {
        nodes: [],
        edges: [{ source: 'A', target: 'B' }],
      }),
    ).toBe('flowchart TD\n  A[Start]\n  B[End]\n  B --> C[Next]')
  })

  it('removes a selected node and edges connected to it', () => {
    const code = 'flowchart TD\n  A[Start]\n  B[End]\n  A --> B\n  B --> C[Next]'

    expect(
      removeSelectionFromMermaid(code, {
        nodes: ['B'],
        edges: [],
      }),
    ).toBe('flowchart TD\n  A[Start]')
  })
})
