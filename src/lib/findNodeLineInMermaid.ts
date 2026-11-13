import { escapeRegExp, stripQuotedText } from './updateNodeLabelInMermaid'

export function findNodeLineInMermaid(code: string, id: string): number | null {
  return findNodeLocationInMermaid(code, id)?.line ?? null
}

export function findNodeLocationInMermaid(
  code: string,
  id: string,
  label?: string,
): { line: number; start: number; end: number } | null {
  const lines = code.split(/\r?\n/)
  const lineStartOffsets = getLineStartOffsets(lines)
  const escapedId = escapeRegExp(id)
  const declarationPattern = new RegExp(
    `(^|[^A-Za-z0-9_])${escapedId}(\\(\\[|\\[\\(|\\(\\(|\\[|\\{|\\()`,
  )
  const bareIdPattern = new RegExp(`(^|[^A-Za-z0-9_])${escapedId}([^A-Za-z0-9_]|$)`)

  const normalizedLabel = label?.trim()
  if (normalizedLabel) {
    const labelLine = lines.findIndex(
      (line) =>
        line.includes(normalizedLabel) &&
        (declarationPattern.test(stripQuotedText(line)) ||
          bareIdPattern.test(stripQuotedText(line))),
    )
    if (labelLine >= 0) {
      return locationForLine(lines[labelLine], labelLine, lineStartOffsets)
    }
  }

  const declarationLine = lines.findIndex((line) =>
    declarationPattern.test(stripQuotedText(line)),
  )
  if (declarationLine >= 0) {
    return locationForLine(lines[declarationLine], declarationLine, lineStartOffsets)
  }

  const referenceLine = lines.findIndex((line) =>
    bareIdPattern.test(stripQuotedText(line)),
  )
  if (referenceLine >= 0) {
    return locationForLine(lines[referenceLine], referenceLine, lineStartOffsets)
  }

  return null
}

export function findSubgraphLocationInMermaid(
  code: string,
  id: string,
  label?: string,
): { line: number; start: number; end: number } | null {
  const lines = code.split(/\r?\n/)
  const lineStartOffsets = getLineStartOffsets(lines)
  const escapedId = escapeRegExp(id)
  const declarationPattern = new RegExp(
    `^\\s*subgraph\\s+${escapedId}(\\b|\\s|\\[|$)`,
    'i',
  )
  const normalizedLabel = label?.trim()
  const escapedLabel = normalizedLabel ? escapeRegExp(normalizedLabel) : ''
  // 정확한 ID → `[제목]` → `"제목"` → 제목 일부 포함 순으로, 앞 방법으로 못 찾을 때만 다음 방법을 쓴다.
  // 한 번에 검사하면 앞쪽의 다른 subgraph 제목에 글자가 들어 있을 때 그 줄을 잘못 고른다.
  const matchers: Array<(line: string) => boolean> = [
    (line) => declarationPattern.test(line),
  ]
  if (normalizedLabel) {
    const titlePattern = new RegExp(
      `^\\s*subgraph\\s+\\S+\\s*\\[\\s*${escapedLabel}\\s*\\]`,
      'i',
    )
    const quotedTitlePattern = new RegExp(`^\\s*subgraph\\s+"${escapedLabel}"\\s*$`, 'i')
    matchers.push(
      (line) => titlePattern.test(line),
      (line) => quotedTitlePattern.test(line),
      (line) => /^\s*subgraph\s+/i.test(line) && line.includes(normalizedLabel),
    )
  }

  const subgraphLine =
    matchers.map((matches) => lines.findIndex(matches)).find((index) => index >= 0) ?? -1

  if (subgraphLine >= 0) {
    return locationForLine(lines[subgraphLine], subgraphLine, lineStartOffsets)
  }

  return null
}

type MermaidElementTarget = {
  id: string
  type: 'node' | 'group'
  label?: string
  groupId?: string
}

export function findMermaidElementAtOffset(
  code: string,
  offset: number,
  targets: MermaidElementTarget[],
): { id: string; type: 'node' | 'group' } | null {
  const lines = code.split(/\r?\n/)
  const lineStartOffsets = getLineStartOffsets(lines)
  const safeOffset = Math.max(0, Math.min(offset, code.length))
  const line = findLineIndexAtOffset(lineStartOffsets, safeOffset)
  if (line < 0) return null

  const lineText = lines[line]
  const lineStart = lineStartOffsets[line]
  const containingTargets: Array<{ id: string; type: 'node' | 'group'; length: number }> =
    []

  for (const target of targets) {
    if (target.type === 'group') {
      const groupLocation = findSubgraphLocationInMermaid(
        code,
        target.groupId ?? target.id.replace(/^__group_/, ''),
        target.label,
      )
      if (
        groupLocation &&
        groupLocation.line === line &&
        groupLocation.start <= safeOffset &&
        safeOffset <= groupLocation.end
      ) {
        containingTargets.push({
          id: target.id,
          type: target.type,
          length: groupLocation.end - groupLocation.start,
        })
      }
      continue
    }

    for (const span of findNodeSpansInLine(lineText, lineStart, target.id)) {
      if (span.start <= safeOffset && safeOffset <= span.end) {
        containingTargets.push({
          id: target.id,
          type: target.type,
          length: span.end - span.start,
        })
      }
    }
  }

  containingTargets.sort((a, b) => a.length - b.length)
  const selected = containingTargets[0]
  return selected ? { id: selected.id, type: selected.type } : null
}

function getLineStartOffsets(lines: string[]): number[] {
  const lineStartOffsets: number[] = []
  let offset = 0
  for (const line of lines) {
    lineStartOffsets.push(offset)
    offset += line.length + 1
  }
  return lineStartOffsets
}

function findLineIndexAtOffset(lineStartOffsets: number[], offset: number): number {
  let line = -1
  for (let i = 0; i < lineStartOffsets.length; i += 1) {
    if (lineStartOffsets[i] > offset) break
    line = i
  }
  return line
}

function locationForLine(
  lineText: string,
  line: number,
  lineStartOffsets: number[],
): { line: number; start: number; end: number } {
  const start = lineStartOffsets[line]
  return { line, start, end: start + lineText.length }
}

function findNodeSpansInLine(
  lineText: string,
  lineStart: number,
  id: string,
): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = []
  const escapedId = escapeRegExp(id)
  const idPattern = new RegExp(`(^|[^A-Za-z0-9_])(${escapedId})(?![A-Za-z0-9_])`, 'g')
  let match: RegExpExecArray | null

  while ((match = idPattern.exec(lineText)) !== null) {
    const idStart = match.index + match[1].length
    const afterId = idStart + id.length
    const shapeStart = skipWhitespace(lineText, afterId)
    const shapeEnd = endOfShapeExpression(lineText, shapeStart)
    spans.push({
      start: lineStart + idStart,
      end: lineStart + (shapeEnd ?? afterId),
    })
  }

  return spans
}

function skipWhitespace(value: string, index: number): number {
  let next = index
  while (next < value.length && /\s/.test(value[next])) next += 1
  return next
}

function endOfShapeExpression(lineText: string, shapeStart: number): number | null {
  const opener = lineText[shapeStart]
  const closer = opener === '[' ? ']' : opener === '{' ? '}' : opener === '(' ? ')' : null
  if (!closer) return null

  const closeIndex = lineText.indexOf(closer, shapeStart + 1)
  if (closeIndex < 0) return null
  return closeIndex + 1
}
