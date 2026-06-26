import { describe, expect, it } from 'vitest'
import {
  findNodeLineInMermaid,
  findNodeLocationInMermaid,
} from './findNodeLineInMermaid'

describe('findNodeLineInMermaid', () => {
  it('finds the line containing an explicit node declaration', () => {
    const code = 'flowchart TD\n  A[Start]\n  A --> B[End]'

    expect(findNodeLineInMermaid(code, 'B')).toBe(2)
  })

  it('prefers a node declaration over a bare edge reference', () => {
    const code = 'flowchart TD\n  A[Start]\n  B[End]\n  A --> B'

    expect(findNodeLineInMermaid(code, 'B')).toBe(2)
  })

  it('falls back to the first bare id reference when no declaration exists', () => {
    const code = 'flowchart TD\n  A --> B\n  B --> C'

    expect(findNodeLineInMermaid(code, 'B')).toBe(1)
  })

  it('returns the character range for the matched line', () => {
    const code = 'flowchart TD\n  A[Start]\n  A --> B[End]'

    expect(findNodeLocationInMermaid(code, 'B')).toEqual({
      line: 2,
      start: 24,
      end: 38,
    })
  })

  it('prefers a line containing the node label text over an earlier id reference', () => {
    const code =
      'flowchart TD\n  main --> helper\n  main["main() (진입점/설정파싱2)"]'

    expect(
      findNodeLocationInMermaid(code, 'main', 'main() (진입점/설정파싱2)'),
    ).toEqual({
      line: 2,
      start: 31,
      end: 59,
    })
  })

  it('skips duplicate label text when the surrounding node id does not match', () => {
    const code =
      'flowchart TD\n  other["main() (진입점/설정파싱2)"]\n  main["main() (진입점/설정파싱2)"]'

    expect(
      findNodeLocationInMermaid(code, 'main', 'main() (진입점/설정파싱2)'),
    ).toEqual({
      line: 2,
      start: 43,
      end: 71,
    })
  })
})
