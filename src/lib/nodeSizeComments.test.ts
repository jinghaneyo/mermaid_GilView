import { describe, expect, it } from 'vitest'
import {
  parseSubgraphSizeComments,
  parseNodeSizeComments,
  updateSubgraphSizeInMermaid,
  updateNodeSizeInMermaid,
} from './nodeSizeComments'

describe('node size comments', () => {
  it('parses gilview node size comments by node id', () => {
    const sizes = parseNodeSizeComments(
      'graph TD\n%% gilview:node main width=260 height=120\n  main[Main]',
    )

    expect(sizes.get('main')).toEqual({ width: 260, height: 120 })
  })

  it('updates an existing node size comment', () => {
    const code = 'graph TD\n%% gilview:node main width=260 height=120\n  main[Main]'

    expect(updateNodeSizeInMermaid(code, 'main', { width: 320, height: 140 })).toBe(
      'graph TD\n%% gilview:node main width=320 height=140\n  main[Main]',
    )
  })

  it('inserts a node size comment before the node declaration when missing', () => {
    const code = 'graph TD\n  main[Main]\n  main --> done'

    expect(updateNodeSizeInMermaid(code, 'main', { width: 240, height: 90 })).toBe(
      'graph TD\n%% gilview:node main width=240 height=90\n  main[Main]\n  main --> done',
    )
  })
})

describe('subgraph size comments', () => {
  it('parses gilview subgraph size comments by subgraph id', () => {
    const sizes = parseSubgraphSizeComments(
      'graph TD\n%% gilview:subgraph Boot width=420 height=260\nsubgraph Boot\n  A[Main]\nend',
    )

    expect(sizes.get('Boot')).toEqual({ width: 420, height: 260 })
  })

  it('updates an existing subgraph size comment', () => {
    const code =
      'graph TD\n%% gilview:subgraph Boot width=420 height=260\nsubgraph Boot\n  A[Main]\nend'

    expect(updateSubgraphSizeInMermaid(code, 'Boot', { width: 500, height: 280 })).toBe(
      'graph TD\n%% gilview:subgraph Boot width=500 height=280\nsubgraph Boot\n  A[Main]\nend',
    )
  })

  it('inserts a subgraph size comment before the subgraph declaration', () => {
    const code = 'graph TD\nsubgraph Boot\n  A[Main]\nend'

    expect(updateSubgraphSizeInMermaid(code, 'Boot', { width: 500, height: 280 })).toBe(
      'graph TD\n%% gilview:subgraph Boot width=500 height=280\nsubgraph Boot\n  A[Main]\nend',
    )
  })
})
