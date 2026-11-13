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

  it('removes a selected node and edges connected to it, keeping neighbour declarations', () => {
    const code = 'flowchart TD\n  A[Start]\n  B[End]\n  A --> B\n  B --> C[Next]'

    expect(
      removeSelectionFromMermaid(code, {
        nodes: ['B'],
        edges: [],
      }),
    ).toBe('flowchart TD\n  A[Start]\n  C[Next]')
  })

  it('keeps inline node declarations when editing an edge label', () => {
    expect(
      updateEdgeLabelInMermaid('graph TD\n  A[Start] --> B[End]', {
        source: 'A',
        target: 'B',
        label: 'yes',
      }),
    ).toBe('graph TD\n  A[Start] -->|yes| B[End]')
  })

  it('edits labels inside chains and keeps the arrow style', () => {
    expect(
      updateEdgeLabelInMermaid('graph TD\n  A --> B --> C', {
        source: 'B',
        target: 'C',
        label: 'x',
      }),
    ).toBe('graph TD\n  A --> B -->|x| C')
    expect(
      updateEdgeLabelInMermaid('graph TD\n  A -. old .-> B', {
        source: 'A',
        target: 'B',
        label: 'new',
      }),
    ).toBe('graph TD\n  A -.->|new| B')
    expect(
      updateEdgeLabelInMermaid('graph TD\n  A ==>|old| B', {
        source: 'A',
        target: 'B',
        label: '',
      }),
    ).toBe('graph TD\n  A ==> B')
  })

  it('keeps both nodes when deleting the only edge that declares them', () => {
    expect(
      removeSelectionFromMermaid('graph TD\n  A[Start] --> B[End]', {
        nodes: [],
        edges: [{ source: 'A', target: 'B' }],
      }),
    ).toBe('graph TD\n  A[Start]\n  B[End]')
  })

  it('removes only the selected link of a chain', () => {
    const code = 'graph TD\n  A --> B --> C'

    expect(
      removeSelectionFromMermaid(code, { nodes: [], edges: [{ source: 'B', target: 'C' }] }),
    ).toBe('graph TD\n  C\n  A --> B')
    expect(
      removeSelectionFromMermaid(code, { nodes: [], edges: [{ source: 'A', target: 'B' }] }),
    ).toBe('graph TD\n  A\n  B --> C')
    expect(removeSelectionFromMermaid(code, { nodes: ['C'], edges: [] })).toBe(
      'graph TD\n  A --> B',
    )
  })

  it('removes dotted, thick and grouped edges', () => {
    expect(
      removeSelectionFromMermaid('graph TD\n  A -.-> B\n  A ==> C', {
        nodes: [],
        edges: [
          { source: 'A', target: 'B' },
          { source: 'A', target: 'C' },
        ],
      }),
    ).toBe('graph TD\n  A\n  B\n  C')
    expect(
      removeSelectionFromMermaid('graph TD\n  A & B --> C', {
        nodes: [],
        edges: [{ source: 'A', target: 'C' }],
      }),
    ).toBe('graph TD\n  A\n  B --> C')
  })

  it('removes a node left as a bare statement', () => {
    expect(
      removeSelectionFromMermaid('graph TD\n  A --> B\n  C', { nodes: ['C'], edges: [] }),
    ).toBe('graph TD\n  A --> B')
  })

  it('does not mistake label text for a node id', () => {
    expect(
      removeSelectionFromMermaid('graph TD\n  A --> B\n  C[Step A]', {
        nodes: [],
        edges: [{ source: 'A', target: 'B' }],
      }),
    ).toBe('graph TD\n  A\n  B\n  C[Step A]')
    expect(
      removeSelectionFromMermaid('graph TD\n  A --> B\n  C[Step A(1)]', {
        nodes: ['A'],
        edges: [],
      }),
    ).toBe('graph TD\n  B\n  C[Step A(1)]')
  })

  it('keeps orphaned nodes inside their own subgraph', () => {
    expect(
      removeSelectionFromMermaid(
        'graph TD\n  subgraph G\n    A --> B\n  end\n  B --> C',
        { nodes: [], edges: [{ source: 'A', target: 'B' }] },
      ),
    ).toBe('graph TD\n  subgraph G\n    A\n    B\n  end\n  B --> C')
    expect(
      removeSelectionFromMermaid('graph TD\n  A --> B\n  C -- to A --> D', {
        nodes: [],
        edges: [{ source: 'A', target: 'B' }],
      }),
    ).toBe('graph TD\n  A\n  B\n  C -- to A --> D')
  })

  it('matches the closing arrow of a text link to its opening kind', () => {
    const code = 'graph TD\n  A -- v1.-beta --> B\n  B --> C'

    expect(removeSelectionFromMermaid(code, { nodes: ['B'], edges: [] })).toBe(
      'graph TD\n  A\n  C',
    )
    expect(
      updateEdgeLabelInMermaid(code, { source: 'A', target: 'B', label: 'x' }),
    ).toBe('graph TD\n  A -->|x| B\n  B --> C')
  })

  it('keeps a later shaped declaration when the bare id came first', () => {
    expect(
      removeSelectionFromMermaid('graph TD\n  X --> A\n  X --> A[Label]', {
        nodes: ['X'],
        edges: [],
      }),
    ).toBe('graph TD\n  A\n  A[Label]')
  })

  it('does not delete unparsed lines that contain other arrows', () => {
    const code = 'graph TD\n  A[S] ==> B[E]; C'

    expect(removeSelectionFromMermaid(code, { nodes: ['B'], edges: [] })).toBe(code)
  })

  it('leaves unsupported edge syntax untouched', () => {
    const code = 'graph TD\n  A --> B; B --> C'

    expect(
      removeSelectionFromMermaid(code, { nodes: [], edges: [{ source: 'A', target: 'B' }] }),
    ).toBe(code)
  })

  it('changes nothing when an unparsed line still uses the deleted node', () => {
    // B[Mid]만 지우면 다시 그릴 때 B가 라벨 없이 되살아난다.
    const code = 'graph TD\n  A --> B; B --> C\n  B[Mid]'

    expect(removeSelectionFromMermaid(code, { nodes: ['B'], edges: [] })).toBe(code)
  })

  it('does not hold back a deletion because of titles or label text', () => {
    const select = { nodes: ['Order'], edges: [{ source: 'Order', target: 'Ship' }] }

    expect(
      removeSelectionFromMermaid('---\ntitle: Order & Ship\n---\nflowchart TD\n  Order --> Ship', select),
    ).toBe('---\ntitle: Order & Ship\n---\nflowchart TD\n  Ship')
    expect(
      removeSelectionFromMermaid('flowchart TD\n  accTitle: Order & Ship\n  Order --> Ship', select),
    ).toBe('flowchart TD\n  accTitle: Order & Ship\n  Ship')
    expect(
      removeSelectionFromMermaid('graph TD\n  A --> B\n  가[A 처리] --> 나', {
        nodes: ['A'],
        edges: [],
      }),
    ).toBe('graph TD\n  B\n  가[A 처리] --> 나')
  })

  it('does not drop other nodes declared on the same unparsed line', () => {
    const code = 'graph TD\n  A --> B\n  B[Mid]; C[Other]'

    expect(
      removeSelectionFromMermaid(code, { nodes: ['B'], edges: [{ source: 'A', target: 'B' }] }),
    ).toBe(code)
  })

  it('treats capitalised End as a node id, not the end keyword', () => {
    expect(
      removeSelectionFromMermaid('graph TD\n  Start[S]\n  End[E]\n  Start --> End', {
        nodes: ['End'],
        edges: [],
      }),
    ).toBe('graph TD\n  Start[S]')
    expect(
      removeSelectionFromMermaid('graph TD\n  subgraph G\n    End\n    A --> B\n  end\n  B', {
        nodes: [],
        edges: [{ source: 'A', target: 'B' }],
      }),
    ).toBe('graph TD\n  subgraph G\n    End\n    A\n    B\n  end\n  B')
  })

  it('keeps the class suffix of an orphaned node', () => {
    expect(
      removeSelectionFromMermaid('graph TD\n  A:::hot --> B\n  A --> C', {
        nodes: [],
        edges: [{ source: 'A', target: 'B' }],
      }),
    ).toBe('graph TD\n  A:::hot\n  B\n  A --> C')
    expect(
      removeSelectionFromMermaid('graph TD\n  X --> A:::hot\n  A --> C', {
        nodes: ['X'],
        edges: [],
      }),
    ).toBe('graph TD\n  A:::hot\n  A --> C')
  })

  it('tracks nested subgraphs closed with end;', () => {
    const code =
      'graph TD\n  subgraph O\n    subgraph I\n      A --> B\n    end;\n    A\n  end;\n  B --> C'

    expect(
      removeSelectionFromMermaid(code, { nodes: [], edges: [{ source: 'A', target: 'B' }] }),
    ).toBe(
      'graph TD\n  subgraph O\n    subgraph I\n      A\n      B\n    end;\n    A\n  end;\n  B --> C',
    )
  })
})
