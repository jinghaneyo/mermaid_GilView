import { parseMermaid } from './parseMermaid'
import { layout, NODE_WIDTH, NODE_HEIGHT, type LayoutOptions } from './layout'
import {
  parseNodeSizeComments,
  parseSubgraphSizeComments,
  type NodeSize,
} from './nodeSizeComments'
import type { ConvertResult, FlowNode, GroupBox, Subgraph } from './types'

// 그룹 박스 여백/제목 공간
const GROUP_PAD = 24
const GROUP_TITLE_H = 22

// subgraph 멤버 노드들의 바운딩 박스를 계산해 그룹 박스로 변환
function computeGroups(
  subgraphs: Subgraph[],
  nodes: FlowNode[],
  groupSizes = new Map<string, NodeSize>(),
): GroupBox[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const groups: GroupBox[] = []

  for (const sg of subgraphs) {
    const members = sg.nodeIds
      .map((id) => byId.get(id))
      .filter((n): n is FlowNode => Boolean(n))
    if (members.length === 0) continue

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const n of members) {
      minX = Math.min(minX, n.position.x)
      minY = Math.min(minY, n.position.y)
      maxX = Math.max(maxX, n.position.x + (n.width ?? NODE_WIDTH))
      maxY = Math.max(maxY, n.position.y + (n.height ?? NODE_HEIGHT))
    }

    const computedWidth = maxX - minX + GROUP_PAD * 2
    const computedHeight = maxY - minY + GROUP_PAD * 2 + GROUP_TITLE_H
    const customSize = groupSizes.get(sg.id)

    groups.push({
      id: sg.id,
      label: sg.title,
      position: { x: minX - GROUP_PAD, y: minY - GROUP_PAD - GROUP_TITLE_H },
      width: customSize ? Math.max(computedWidth, customSize.width) : computedWidth,
      height: customSize ? Math.max(computedHeight, customSize.height) : computedHeight,
      nodeIds: members.map((n) => n.id),
      ...(customSize ? { customSize: true } : {}),
    })
  }

  return groups
}

export interface ConvertMermaidOptions extends LayoutOptions {}

export async function convertMermaid(
  code: string,
  options: ConvertMermaidOptions = {},
): Promise<ConvertResult> {
  const { graph, error } = await parseMermaid(code)
  if (error || !graph) {
    return { nodes: [], edges: [], error: error ?? '알 수 없는 오류' }
  }
  const nodeSizes = parseNodeSizeComments(code)
  const groupSizes = parseSubgraphSizeComments(code)
  const { nodes, edges } = layout(graph, { ...options, nodeSizes })
  const groups = computeGroups(graph.subgraphs ?? [], nodes, groupSizes)
  return { nodes, edges, error: null, groups }
}
