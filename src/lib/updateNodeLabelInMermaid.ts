function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function escapeLabel(value: string): string {
  return value.replace(/\r?\n/g, ' ').trim()
}

export function formatMermaidLabel(value: string): string {
  const label = escapeLabel(value)
  const escaped = label.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return /[\[\]{}()|"]/.test(escaped) ? `"${escaped}"` : escaped
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
  const label = escapeLabel(nextLabel) || id
  const mermaidLabel = formatMermaidLabel(label)
  const escapedId = escapeRegExp(id)
  const tokenPattern = new RegExp(
    `(^|[^A-Za-z0-9_])(${escapedId})(\\(\\[|\\[\\(|\\(\\(|\\[|\\{|\\()([^\\r\\n]*?)(\\]\\)|\\)\\]|\\)\\)|\\]|\\}|\\))`,
    'g',
  )
  let replaced = false

  const nextCode = code.replace(
    tokenPattern,
    (match, prefix, nodeId, open, _oldLabel, close) => {
      if (!isMatchingDelimiter(open, close)) return match
      replaced = true
      return `${prefix}${nodeId}${open}${mermaidLabel}${close}`
    },
  )

  return replaced ? nextCode : insertDeclaration(code, id, label)
}

function isMatchingDelimiter(open: string, close: string): boolean {
  return (
    (open === '[' && close === ']') ||
    (open === '{' && close === '}') ||
    (open === '(' && close === ')') ||
    (open === '((' && close === '))') ||
    (open === '([' && close === '])') ||
    (open === '[(' && close === ')]')
  )
}
