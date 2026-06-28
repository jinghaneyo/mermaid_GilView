import { describe, expect, it } from 'vitest'
import { getFlowBoundsFromClientRects, getTightExportFrame } from './exportImageFrame'

describe('getTightExportFrame', () => {
  it('uses only the content bounds without adding export padding', () => {
    expect(
      getTightExportFrame({ x: 20, y: 30, width: 200, height: 100 }),
    ).toEqual({
      width: 200,
      height: 100,
      transform: 'translate(-20px, -30px) scale(1)',
    })
  })

  it('rounds outward so fractional content bounds are not cropped', () => {
    expect(
      getTightExportFrame({ x: 20.4, y: 30.6, width: 199.2, height: 99.2 }),
    ).toEqual({
      width: 200,
      height: 100,
      transform: 'translate(-20px, -30px) scale(1)',
    })
  })
})

describe('getFlowBoundsFromClientRects', () => {
  it('converts rendered DOM bounds back into flow coordinates', () => {
    expect(
      getFlowBoundsFromClientRects(
        { left: 100, top: 50, right: 500, bottom: 350, width: 400, height: 300 },
        2,
        [
          { left: 140, top: 90, right: 340, bottom: 190, width: 200, height: 100 },
          { left: 120, top: 70, right: 380, bottom: 230, width: 260, height: 160 },
        ],
      ),
    ).toEqual({
      x: 10,
      y: 10,
      width: 130,
      height: 80,
    })
  })
})
