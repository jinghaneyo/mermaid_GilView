import { describe, expect, it } from 'vitest'
import { placeAddedNodeNearAnchor } from './placeAddedNode'

describe('placeAddedNodeNearAnchor', () => {
  it('places a new node to the right of the anchor in horizontal flowcharts', () => {
    expect(
      placeAddedNodeNearAnchor({
        direction: 'LR',
        anchor: { x: 100, y: 80, width: 160, height: 44 },
        added: { width: 120, height: 40 },
      }),
    ).toEqual({ x: 300, y: 82 })
  })

  it('places a new node below the anchor in vertical flowcharts', () => {
    expect(
      placeAddedNodeNearAnchor({
        direction: 'TB',
        anchor: { x: 100, y: 80, width: 160, height: 44 },
        added: { width: 120, height: 40 },
      }),
    ).toEqual({ x: 120, y: 164 })
  })
})
