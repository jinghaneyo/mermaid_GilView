import { describe, expect, it } from 'vitest'
import { scrollTopForLine } from './codeEditorScroll'

describe('scrollTopForLine', () => {
  it('centers a target line when there is enough scroll room', () => {
    expect(
      scrollTopForLine({
        line: 20,
        lineHeight: 20,
        paddingTop: 16,
        clientHeight: 100,
        scrollHeight: 800,
      }),
    ).toBe(376)
  })

  it('clamps the result inside the scrollable range', () => {
    expect(
      scrollTopForLine({
        line: 1,
        lineHeight: 20,
        paddingTop: 16,
        clientHeight: 100,
        scrollHeight: 800,
      }),
    ).toBe(0)

    expect(
      scrollTopForLine({
        line: 99,
        lineHeight: 20,
        paddingTop: 16,
        clientHeight: 100,
        scrollHeight: 800,
      }),
    ).toBe(700)
  })
})
