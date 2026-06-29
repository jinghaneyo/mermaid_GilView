export interface Point {
  x: number
  y: number
}

export interface ScrollViewport {
  left: number
  top: number
  width: number
  height: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function centerViewportOnPoint({
  point,
  zoom,
  contentWidth,
  contentHeight,
  clientWidth,
  clientHeight,
}: {
  point: Point
  zoom: number
  contentWidth: number
  contentHeight: number
  clientWidth: number
  clientHeight: number
}): { left: number; top: number } {
  return {
    left: clamp(
      point.x * zoom - clientWidth / 2,
      0,
      Math.max(0, contentWidth - clientWidth),
    ),
    top: clamp(
      point.y * zoom - clientHeight / 2,
      0,
      Math.max(0, contentHeight - clientHeight),
    ),
  }
}

export function minimapViewportRect({
  scroll,
  contentWidth,
  contentHeight,
  minimapWidth,
  minimapHeight,
  padding,
}: {
  scroll: ScrollViewport
  contentWidth: number
  contentHeight: number
  minimapWidth: number
  minimapHeight: number
  padding: number
}): { x: number; y: number; width: number; height: number } {
  const plotWidth = minimapWidth - padding * 2
  const plotHeight = minimapHeight - padding * 2

  return {
    x: padding + (scroll.left / contentWidth) * plotWidth,
    y: padding + (scroll.top / contentHeight) * plotHeight,
    width: Math.max(10, (scroll.width / contentWidth) * plotWidth),
    height: Math.max(10, (scroll.height / contentHeight) * plotHeight),
  }
}

export function viewportFromMinimapPoint({
  point,
  contentWidth,
  contentHeight,
  clientWidth,
  clientHeight,
  minimapWidth,
  minimapHeight,
  padding,
}: {
  point: Point
  contentWidth: number
  contentHeight: number
  clientWidth: number
  clientHeight: number
  minimapWidth: number
  minimapHeight: number
  padding: number
}): { left: number; top: number } {
  const plotWidth = minimapWidth - padding * 2
  const plotHeight = minimapHeight - padding * 2
  const localX = clamp(point.x, padding, minimapWidth - padding)
  const localY = clamp(point.y, padding, minimapHeight - padding)
  const ratioX = (localX - padding) / plotWidth
  const ratioY = (localY - padding) / plotHeight

  return {
    left: clamp(
      ratioX * contentWidth - clientWidth / 2,
      0,
      Math.max(0, contentWidth - clientWidth),
    ),
    top: clamp(
      ratioY * contentHeight - clientHeight / 2,
      0,
      Math.max(0, contentHeight - clientHeight),
    ),
  }
}
