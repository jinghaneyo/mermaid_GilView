import type { Direction } from './types'

const GAP = 40

export interface PlacementRect {
  x: number
  y: number
  width: number
  height: number
}

export function placeAddedNodeNearAnchor({
  direction,
  anchor,
  added,
}: {
  direction: Direction
  anchor: PlacementRect
  added: Pick<PlacementRect, 'width' | 'height'>
}): { x: number; y: number } {
  if (direction === 'LR' || direction === 'RL') {
    return {
      x: Math.round(anchor.x + anchor.width + GAP),
      y: Math.round(anchor.y + (anchor.height - added.height) / 2),
    }
  }

  return {
    x: Math.round(anchor.x + (anchor.width - added.width) / 2),
    y: Math.round(anchor.y + anchor.height + GAP),
  }
}
