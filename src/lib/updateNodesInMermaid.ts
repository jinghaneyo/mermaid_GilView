import { formatMermaidLabel } from './updateNodeLabelInMermaid'

export type AddNodeShape =
  | 'rect'
  | 'diamond'
  | 'cylinder'
  | 'stadium'
  | 'round'
  | 'circle'

export interface AddNodeOptions {
  shape: AddNodeShape
  label: string
}

export function addNodeToMermaid(code: string, options: AddNodeOptions): string {
  const lines = code.split(/\r?\n/)
  const headerIndex = lines.findIndex((line) =>
    /^\s*(?:graph|flowchart)\s+(?:TB|TD|BT|LR|RL)\b/i.test(line),
  )
  const id = nextNodeId(code)
  const declaration = `  ${formatNodeDeclaration(id, options.shape, options.label)}`

  if (headerIndex < 0) return `${declaration}\n${code}`

  lines.splice(headerIndex + 1, 0, declaration)
  return lines.join('\n')
}

function nextNodeId(code: string): string {
  const used = new Set<string>()
  const idPattern = /\b([A-Za-z][A-Za-z0-9_]*)\s*(?=(?:\(\[|\[\(|\(\(|\[|\{|\())/g
  const bareEdgePattern = /\b([A-Za-z][A-Za-z0-9_]*)\b\s*(?:-->|$)/g

  for (const line of code.split(/\r?\n/)) {
    const stripped = stripQuotedText(line)
    for (const match of stripped.matchAll(idPattern)) used.add(match[1])
    for (const match of stripped.matchAll(bareEdgePattern)) used.add(match[1])
  }

  let index = 1
  while (used.has(`N${index}`)) index += 1
  return `N${index}`
}

function formatNodeDeclaration(
  id: string,
  shape: AddNodeShape,
  label: string,
): string {
  const text = formatMermaidLabel(label.trim() || id)

  switch (shape) {
    case 'diamond':
      return `${id}{${text}}`
    case 'cylinder':
      return `${id}[(${text})]`
    case 'stadium':
      return `${id}([${text}])`
    case 'round':
      return `${id}(${text})`
    case 'circle':
      return `${id}((${text}))`
    default:
      return `${id}[${text}]`
  }
}

function stripQuotedText(line: string): string {
  return line.replace(/"([^"\\]|\\.)*"/g, '""')
}
