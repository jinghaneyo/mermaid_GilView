import type { FlowNode, FlowEdge } from './types'

/**
 * React Flow의 nodes/edges 데이터를 Mermaid 플로우차트 문자열로 변환한다.
 * - 첫 줄은 항상 `graph TD`
 * - 각 노드는 `ID[라벨]` 형태 (라벨이 없으면 ID를 사용)
 * - 각 엣지는 `source --> target` (라벨이 있으면 `source -->|라벨| target`)
 * - 결과는 줄바꿈(\n)으로 구분된 단일 문자열
 *
 * parseMermaid의 역방향이며, 라벨을 포함해 round-trip이 되도록 작성했다.
 */
export function convertCanvasToMermaid(
  nodes: FlowNode[],
  edges: FlowEdge[],
): string {
  const lines: string[] = ['graph TD']

  for (const node of nodes ?? []) {
    const raw = node.data?.label
    const label = raw !== undefined && raw !== '' ? raw : node.id
    lines.push(`  ${node.id}[${label}]`)
  }

  for (const edge of edges ?? []) {
    const label = edge.label
    if (label !== undefined && label !== '') {
      lines.push(`  ${edge.source} -->|${label}| ${edge.target}`)
    } else {
      lines.push(`  ${edge.source} --> ${edge.target}`)
    }
  }

  return lines.join('\n')
}
