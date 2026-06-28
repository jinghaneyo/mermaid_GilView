export interface ExportBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface TightExportFrame {
  width: number
  height: number
  transform: string
}

export interface ClientRectBounds {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export function getFlowBoundsFromClientRects(
  viewportRect: ClientRectBounds,
  zoom: number,
  rects: ClientRectBounds[],
): ExportBounds | null {
  const visibleRects = rects.filter((rect) => rect.width > 0 && rect.height > 0)
  if (visibleRects.length === 0) return null

  const scale = zoom > 0 ? zoom : 1
  const minLeft = Math.min(...visibleRects.map((rect) => rect.left))
  const minTop = Math.min(...visibleRects.map((rect) => rect.top))
  const maxRight = Math.max(...visibleRects.map((rect) => rect.right))
  const maxBottom = Math.max(...visibleRects.map((rect) => rect.bottom))

  return {
    x: (minLeft - viewportRect.left) / scale,
    y: (minTop - viewportRect.top) / scale,
    width: (maxRight - minLeft) / scale,
    height: (maxBottom - minTop) / scale,
  }
}

export function getTightExportFrame(bounds: ExportBounds): TightExportFrame {
  const x = Math.floor(bounds.x)
  const y = Math.floor(bounds.y)
  const right = Math.ceil(bounds.x + bounds.width)
  const bottom = Math.ceil(bounds.y + bounds.height)
  const width = Math.max(1, right - x)
  const height = Math.max(1, bottom - y)

  return {
    width,
    height,
    transform: `translate(${-x}px, ${-y}px) scale(1)`,
  }
}
