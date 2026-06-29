import {
  centerViewportOnPoint,
  minimapViewportRect,
  viewportFromMinimapPoint,
} from './visualViewport'

describe('visualViewport shared viewport helpers', () => {
  it('centers a selected diagram point inside the scroll viewport', () => {
    expect(
      centerViewportOnPoint({
        point: { x: 824, y: 112 },
        zoom: 1,
        contentWidth: 1200,
        contentHeight: 600,
        clientWidth: 320,
        clientHeight: 220,
      }),
    ).toEqual({ left: 664, top: 2 })
  })

  it('clamps centered scrolling inside content bounds', () => {
    expect(
      centerViewportOnPoint({
        point: { x: 20, y: 20 },
        zoom: 1,
        contentWidth: 1200,
        contentHeight: 600,
        clientWidth: 320,
        clientHeight: 220,
      }),
    ).toEqual({ left: 0, top: 0 })

    expect(
      centerViewportOnPoint({
        point: { x: 1190, y: 590 },
        zoom: 1,
        contentWidth: 1200,
        contentHeight: 600,
        clientWidth: 320,
        clientHeight: 220,
      }),
    ).toEqual({ left: 880, top: 380 })
  })

  it('maps the scroll viewport into minimap coordinates', () => {
    const rect = minimapViewportRect({
        scroll: { left: 300, top: 100, width: 320, height: 220 },
        contentWidth: 1200,
        contentHeight: 600,
        minimapWidth: 144,
        minimapHeight: 78,
        padding: 8,
      })

    expect(rect.x).toBeCloseTo(40)
    expect(rect.y).toBeCloseTo(18.333333333333332)
    expect(rect.width).toBeCloseTo(34.13333333333333)
    expect(rect.height).toBeCloseTo(22.733333333333334)
  })

  it('converts a minimap click into centered scroll coordinates', () => {
    const scroll = viewportFromMinimapPoint({
        point: { x: 120, y: 42 },
        contentWidth: 1200,
        contentHeight: 600,
        clientWidth: 320,
        clientHeight: 220,
        minimapWidth: 144,
        minimapHeight: 78,
        padding: 8,
      })

    expect(scroll.left).toBeCloseTo(880)
    expect(scroll.top).toBeCloseTo(219.0322580645161)
  })
})
