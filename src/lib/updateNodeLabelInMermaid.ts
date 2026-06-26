function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeLabel(value: string): string {
  return value.replace(/\r\n?/g, '\n').trim()
}

function encodeLineBreaks(value: string): string {
  return value.replace(/\n/g, '<br/>')
}

export function formatMermaidLabel(value: string): string {
  const normalized = normalizeLabel(value)
  const label = encodeLineBreaks(normalized)
  const escaped = label.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return /[\[\]{}()|"<]|\n/.test(normalized) ? `"${escaped}"` : escaped
}

function insertDeclaration(code: string, id: string, label: string): string {
  const lines = code.split(/\r?\n/)
  const headerIndex = lines.findIndex((line) =>
    /^\s*(?:graph|flowchart)\s+(?:TB|TD|BT|LR|RL)\b/i.test(line),
  )
  const declaration = `  ${id}[${formatMermaidLabel(label || id)}]`

  if (headerIndex < 0) return `${declaration}\n${code}`
  return [
    ...lines.slice(0, headerIndex + 1),
    declaration,
    ...lines.slice(headerIndex + 1),
  ].join('\n')
}

export function updateNodeLabelInMermaid(
  code: string,
  id: string,
  nextLabel: string,
): string {
  const label = normalizeLabel(nextLabel) || id
  const mermaidLabel = formatMermaidLabel(label)
  const escapedId = escapeRegExp(id)
  const delimiterPairs: Array<[string, string]> = [
    ['([', '])'],
    ['[(', ')]'],
    ['((', '))'],
    ['[', ']'],
    ['{', '}'],
    ['(', ')'],
  ]

  for (const [open, close] of delimiterPairs) {
    const tokenPattern = new RegExp(
      `(^|[^A-Za-z0-9_])(${escapedId})(${escapeRegExp(open)})(?:"(?:\\\\.|[^"\\\\])*"|[^\\r\\n]*?)(${escapeRegExp(close)})`,
      'g',
    )
    let replaced = false
    const nextCode = code.replace(tokenPattern, (_match, prefix, nodeId) => {
      replaced = true
      return `${prefix}${nodeId}${open}${mermaidLabel}${close}`
    })

    if (replaced) return nextCode
  }

  return insertDeclaration(code, id, label)
}
