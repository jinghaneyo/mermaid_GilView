import { describe, expect, it } from 'vitest'
import { estimateLabelEditorRows } from './labelEditorSizing'

describe('estimateLabelEditorRows', () => {
  it('uses more rows when the same label is edited in a narrower node', () => {
    const label = 'This is a long label that should wrap inside the node editor'

    expect(estimateLabelEditorRows(label, 120)).toBeGreaterThan(
      estimateLabelEditorRows(label, 280),
    )
  })

  it('counts explicit new lines as visible rows', () => {
    expect(estimateLabelEditorRows('first\nsecond\nthird', 280)).toBe(3)
  })
})
