import { describe, expect, it } from 'vitest'
import { convertMermaid } from './convertMermaid'
import { updateNodeLabelInMermaid } from './updateNodeLabelInMermaid'

describe('updateNodeLabelInMermaid', () => {
  it('updates a node label without changing the rest of the diagram', () => {
    const code = 'graph TD\n  A[Start] --> B[End]'

    expect(updateNodeLabelInMermaid(code, 'A', 'Begin')).toBe(
      'graph TD\n  A[Begin] --> B[End]',
    )
  })

  it('preserves the existing node shape syntax', () => {
    const code = 'graph TD\n  A{Old decision} --> B((Done))'

    expect(updateNodeLabelInMermaid(code, 'A', 'New decision')).toBe(
      'graph TD\n  A{New decision} --> B((Done))',
    )
  })

  it('adds a declaration when the node only appears as a bare id', () => {
    const code = 'graph TD\n  A --> B'

    expect(updateNodeLabelInMermaid(code, 'A', 'Start')).toBe(
      'graph TD\n  A[Start]\n  A --> B',
    )
  })

  it('quotes labels with mermaid shape syntax characters so the result parses', async () => {
    const code = 'flowchart TD\n  main[main]'
    const nextCode = updateNodeLabelInMermaid(
      code,
      'main',
      'main() (진입점/설정파싱2)',
    )

    expect(nextCode).toBe('flowchart TD\n  main["main() (진입점/설정파싱2)"]')
    await expect(convertMermaid(nextCode)).resolves.toMatchObject({ error: null })
  })

  it('updates an existing quoted label containing shape syntax characters', async () => {
    const code = 'flowchart TD\n  main["main() (진입점/설정파싱2)"] --> done[Done]'
    const nextCode = updateNodeLabelInMermaid(code, 'main', 'updated')

    expect(nextCode).toBe('flowchart TD\n  main[updated] --> done[Done]')
    await expect(convertMermaid(nextCode)).resolves.toMatchObject({ error: null })
  })

  it('stores multiline labels as Mermaid br markup', async () => {
    const code = 'flowchart TD\n  main[Old]'
    const nextCode = updateNodeLabelInMermaid(code, 'main', 'First\nSecond')

    expect(nextCode).toBe('flowchart TD\n  main["First<br/>Second"]')
    await expect(convertMermaid(nextCode)).resolves.toMatchObject({ error: null })
  })
})
