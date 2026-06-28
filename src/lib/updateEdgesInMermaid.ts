import { formatMermaidLabel } from './updateNodeLabelInMermaid'

export interface EdgeReference {
  source: string
  target: string
  label?: string
}

export interface MermaidSelection {
  nodes: string[]
  edges: EdgeReference[]
}

export function addEdgeToMermaid(code: string, edge: EdgeReference): string {
  return `${code}\n  ${formatEdge(edge)}`
}

export function updateEdgeLabelInMermaid(
  code: string,
  edge: EdgeReference,
): string {
  return code
    .split(/\r?\n/)
    .map((line) => {
      const parsed = parseSimpleEdgeLine(line)
      if (!parsed || parsed.source !== edge.source || parsed.target !== edge.target) {
        return line
      }
      return `${parsed.indent}${formatEdge(edge)}`
    })
    .join('\n')
}

export function removeSelectionFromMermaid(
  code: string,
  selection: MermaidSelection,
): string {
  const nodeIds = new Set(selection.nodes)

  return code
    .split(/\r?\n/)
    .filter((line) => {
      const parsed = parseSimpleEdgeLine(line)
      if (parsed) {
        if (nodeIds.has(parsed.source) || nodeIds.has(parsed.target)) return false
        return !selection.edges.some(
          (edge) => edge.source === parsed.source && edge.target === parsed.target,
        )
      }

      return !selection.nodes.some((id) => isNodeDeclarationLine(line, id))
    })
    .join('\n')
}

function formatEdge(edge: EdgeReference): string {
  if (edge.label) {
    return `${edge.source} -->|${formatMermaidLabel(edge.label)}| ${edge.target}`
  }
  return `${edge.source} --> ${edge.target}`
}

function parseSimpleEdgeLine(
  line: string,
): { indent: string; source: string; target: string } | null {
  const arrowIndex = line.indexOf('-->')
  if (arrowIndex < 0) return null

  const indent = line.match(/^\s*/)?.[0] ?? ''
  const left = line.slice(0, arrowIndex).trim()
  let right = line.slice(arrowIndex + 3).trim()
  right = right.replace(/^\|[^|]*\|\s*/, '').trim()

  const source = parseNodeId(left)
  const target = parseNodeId(right)
  if (!source || !target) return null

  return { indent, source, target }
}

function parseNodeId(token: string): string | null {
  const match = token.match(/^([A-Za-z0-9_]+)/)
  return match?.[1] ?? null
}

function isNodeDeclarationLine(line: string, id: string): boolean {
  if (line.includes('-->')) return false
  const pattern = new RegExp(
    `(^|[^A-Za-z0-9_])${escapeRegExp(id)}\\s*(\\(\\[|\\[\\(|\\(\\(|\\[|\\{|\\()`,
  )
  return pattern.test(stripQuotedText(line))
}

function stripQuotedText(line: string): string {
  return line.replace(/"([^"\\]|\\.)*"/g, '""')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
