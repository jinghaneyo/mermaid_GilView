function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function findNodeLineInMermaid(code: string, id: string): number | null {
  return findNodeLocationInMermaid(code, id)?.line ?? null
}

export function findNodeLocationInMermaid(
  code: string,
  id: string,
  label?: string,
): { line: number; start: number; end: number } | null {
  const lines = code.split(/\r?\n/)
  const escapedId = escapeRegExp(id)
  const declarationPattern = new RegExp(
    `(^|[^A-Za-z0-9_])${escapedId}(\\(\\[|\\[\\(|\\(\\(|\\[|\\{|\\()`,
  )
  const bareIdPattern = new RegExp(`(^|[^A-Za-z0-9_])${escapedId}([^A-Za-z0-9_]|$)`)
  const lineStartOffsets: number[] = []
  let offset = 0
  for (const line of lines) {
    lineStartOffsets.push(offset)
    offset += line.length + 1
  }

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

function stripQuotedText(line: string): string {
  return line.replace(/"([^"\\]|\\.)*"/g, '""')
}

function locationForLine(
  lineText: string,
  line: number,
  lineStartOffsets: number[],
): { line: number; start: number; end: number } {
  const start = lineStartOffsets[line]
  return { line, start, end: start + lineText.length }
}
