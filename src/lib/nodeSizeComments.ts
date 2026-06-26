export interface NodeSize {
  width: number
  height: number
}

const SIZE_COMMENT_RE =
  /^(\s*)%%\s*gilview:(node|subgraph)\s+(\S+)\s+width=(\d+(?:\.\d+)?)\s+height=(\d+(?:\.\d+)?)\s*$/

const MIN_NODE_WIDTH = 40
const MIN_NODE_HEIGHT = 30

function normalizeSize(size: NodeSize): NodeSize {
  return {
    width: Math.max(MIN_NODE_WIDTH, Math.round(size.width)),
    height: Math.max(MIN_NODE_HEIGHT, Math.round(size.height)),
  }
}

export function formatNodeSizeComment(id: string, size: NodeSize): string {
  return formatSizeComment('node', id, size)
}

export function formatSubgraphSizeComment(id: string, size: NodeSize): string {
  return formatSizeComment('subgraph', id, size)
}

function formatSizeComment(kind: 'node' | 'subgraph', id: string, size: NodeSize): string {
  const normalized = normalizeSize(size)
  return `%% gilview:${kind} ${id} width=${normalized.width} height=${normalized.height}`
}

export function parseNodeSizeComments(code: string): Map<string, NodeSize> {
  return parseSizeComments(code, 'node')
}

export function parseSubgraphSizeComments(code: string): Map<string, NodeSize> {
  return parseSizeComments(code, 'subgraph')
}

function parseSizeComments(
  code: string,
  kind: 'node' | 'subgraph',
): Map<string, NodeSize> {
  const sizes = new Map<string, NodeSize>()

  for (const line of code.split(/\r?\n/)) {
    const match = line.match(SIZE_COMMENT_RE)
    if (!match || match[2] !== kind) continue

    sizes.set(match[3], {
      width: Number(match[4]),
      height: Number(match[5]),
    })
  }

  return sizes
}

export function updateNodeSizeInMermaid(
  code: string,
  id: string,
  size: NodeSize,
): string {
  return updateSizeInMermaid(code, 'node', id, size)
}

export function updateSubgraphSizeInMermaid(
  code: string,
  id: string,
  size: NodeSize,
): string {
  return updateSizeInMermaid(code, 'subgraph', id, size)
}

function updateSizeInMermaid(
  code: string,
  kind: 'node' | 'subgraph',
  id: string,
  size: NodeSize,
): string {
  const lines = code.split(/\r?\n/)
  const nextComment =
    kind === 'node'
      ? formatNodeSizeComment(id, size)
      : formatSubgraphSizeComment(id, size)

  const existingIndex = lines.findIndex((line) => {
    const match = line.match(SIZE_COMMENT_RE)
    return match?.[2] === kind && match?.[3] === id
  })

  if (existingIndex >= 0) {
    lines[existingIndex] = nextComment
    return lines.join('\n')
  }

  const declarationIndex =
    kind === 'node'
      ? findNodeDeclarationLine(lines, id)
      : findSubgraphDeclarationLine(lines, id)
  if (declarationIndex >= 0) {
    lines.splice(declarationIndex, 0, nextComment)
    return lines.join('\n')
  }

  const headerIndex = lines.findIndex((line) =>
    /^\s*(?:graph|flowchart)\s+(?:TB|TD|BT|LR|RL)\b/i.test(line),
  )
  const insertIndex = headerIndex >= 0 ? headerIndex + 1 : 0
  lines.splice(insertIndex, 0, nextComment)
  return lines.join('\n')
}

function findNodeDeclarationLine(lines: string[], id: string): number {
  const escapedId = escapeRegExp(id)
  const declarationPattern = new RegExp(
    `(^|[^A-Za-z0-9_])${escapedId}(\\(\\[|\\[\\(|\\(\\(|\\[|\\{|\\()`,
  )

  return lines.findIndex((line) => declarationPattern.test(stripQuotedText(line)))
}

function findSubgraphDeclarationLine(lines: string[], id: string): number {
  const escapedId = escapeRegExp(id)
  const declarationPattern = new RegExp(`^\\s*subgraph\\s+${escapedId}(\\b|\\s|\\[|$)`)

  return lines.findIndex((line) => declarationPattern.test(line))
}

function stripQuotedText(line: string): string {
  return line.replace(/"([^"\\]|\\.)*"/g, '""')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
