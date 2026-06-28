import dagre from '@dagrejs/dagre'
import type { ParsedGraph, FlowGraph, FlowNode, FlowEdge } from './types'
import type { NodeSize } from './nodeSizeComments'

export const NODE_WIDTH = 160
export const NODE_HEIGHT = 44
const GROUP_PAD = 24
const GROUP_TITLE_H = 22

export interface LayoutOptions {
  fitNodeWidthToText?: boolean
  nodeSizes?: Map<string, NodeSize>
}

const TEXT_HORIZONTAL_PAD = 48
const MAX_FIT_WIDTH = 640

function textWidth(label: string): number {
  return [...label].reduce((sum, ch) => {
    const code = ch.charCodeAt(0)
    const isWide =
      (code >= 0x1100 && code <= 0x11ff) ||
      (code >= 0x3130 && code <= 0x318f) ||
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0x3040 && code <= 0x30ff) ||
      (code >= 0x4e00 && code <= 0x9fff)
    return sum + (isWide ? 14 : 8)
  }, 0)
}

function fitWidth(baseWidth: number, label: string): number {
  const measured = textWidth(label.trim()) + TEXT_HORIZONTAL_PAD
  return Math.min(MAX_FIT_WIDTH, Math.max(baseWidth, measured))
}

// 모양별 노드 크기(마름모/원통/원은 더 정사각형에 가깝게)
function sizeForShape(
  shape: string | undefined,
  label = '',
  options: LayoutOptions = {},
  id?: string,
): { w: number; h: number } {
  const persistedSize = id ? options.nodeSizes?.get(id) : undefined
  if (persistedSize) {
    return { w: persistedSize.width, h: persistedSize.height }
  }

  let size: { w: number; h: number }
  switch (shape) {
    case 'diamond':
      size = { w: 140, h: 84 }
      break
    case 'cylinder':
      size = { w: 120, h: 76 }
      break
    case 'circle':
    case 'doublecircle':
      size = { w: 92, h: 92 }
      break
    case 'stadium':
    case 'round':
      size = { w: 150, h: 46 }
      break
    default:
      size = { w: NODE_WIDTH, h: NODE_HEIGHT }
  }
  return options.fitNodeWidthToText ? { ...size, w: fitWidth(size.w, label) } : size
}

export function layout(graph: ParsedGraph, options: LayoutOptions = {}): FlowGraph {
  if (graph.subgraphs?.length) {
    return layoutWithSubgraphs(graph, options)
  }

  return layoutFlat(graph, options)
}

function layoutFlat(graph: ParsedGraph, options: LayoutOptions = {}): FlowGraph {
  // multigraph: true is required to set named edges (preserves parallel edges)
  const g = new dagre.graphlib.Graph({ multigraph: true })
  g.setGraph({ rankdir: graph.direction, nodesep: 50, ranksep: 60 })
  g.setDefaultEdgeLabel(() => ({}))

  graph.nodes.forEach((n) => {
    const { w, h } = sizeForShape(n.shape, n.label, options, n.id)
    g.setNode(n.id, { width: w, height: h })
  })
  graph.edges.forEach((e) => {
    // pass the edge id as the dagre edge name so parallel edges aren't deduped
    g.setEdge(e.source, e.target, {}, e.id)
  })

  dagre.layout(g)

  const nodes: FlowNode[] = graph.nodes.map((n) => {
    const pos = g.node(n.id)
    const { w, h } = sizeForShape(n.shape, n.label, options, n.id)
    const customSize = Boolean(options.nodeSizes?.has(n.id))
    return {
      id: n.id,
      type: 'shape',
      data: { label: n.label, shape: n.shape ?? 'rect', customSize },
      // dagre는 중심 좌표를 주므로 React Flow의 좌상단 좌표로 변환
      position: { x: pos.x - w / 2, y: pos.y - h / 2 },
      width: w,
      height: h,
    }
  })

  const edges: FlowEdge[] = graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    ...(e.label ? { label: e.label } : {}),
  }))

  return { nodes, edges }
}

function layoutWithSubgraphs(
  graph: ParsedGraph,
  options: LayoutOptions = {},
): FlowGraph {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
  const nodeToGroup = new Map<string, string>()
  const groupLayouts = new Map<
    string,
    {
      width: number
      height: number
      nodes: FlowNode[]
    }
  >()

  for (const subgraph of graph.subgraphs ?? []) {
    const members = subgraph.nodeIds
      .map((id) => nodeById.get(id))
      .filter((node): node is ParsedGraph['nodes'][number] => Boolean(node))
    if (members.length === 0) continue

    for (const member of members) {
      if (!nodeToGroup.has(member.id)) nodeToGroup.set(member.id, subgraph.id)
    }

    const memberIds = new Set(members.map((member) => member.id))
    const internalEdges = graph.edges.filter(
      (edge) => memberIds.has(edge.source) && memberIds.has(edge.target),
    )
    const internal = layoutFlat(
      {
        direction: graph.direction,
        nodes: members,
        edges: internalEdges,
      },
      options,
    )
    const bounds = boundsForNodes(internal.nodes)
    groupLayouts.set(subgraph.id, {
      width: bounds.width + GROUP_PAD * 2,
      height: bounds.height + GROUP_PAD * 2 + GROUP_TITLE_H,
      nodes: internal.nodes.map((node) => ({
        ...node,
        position: {
          x: node.position.x - bounds.minX + GROUP_PAD,
          y: node.position.y - bounds.minY + GROUP_PAD + GROUP_TITLE_H,
        },
      })),
    })
  }

  const outer = new dagre.graphlib.Graph({ multigraph: true })
  outer.setGraph({ rankdir: graph.direction, nodesep: 50, ranksep: 60 })
  outer.setDefaultEdgeLabel(() => ({}))

  const outerNodeIds = new Set<string>()
  const outerIdForGroup = (id: string) => `__group_layout_${id}`
  const ownerForNode = (id: string) => {
    const groupId = nodeToGroup.get(id)
    return groupId ? outerIdForGroup(groupId) : id
  }

  for (const [groupId, groupLayout] of groupLayouts) {
    const outerId = outerIdForGroup(groupId)
    outerNodeIds.add(outerId)
    outer.setNode(outerId, {
      width: groupLayout.width,
      height: groupLayout.height,
    })
  }

  for (const node of graph.nodes) {
    if (nodeToGroup.has(node.id)) continue
    const { w, h } = sizeForShape(node.shape, node.label, options, node.id)
    outerNodeIds.add(node.id)
    outer.setNode(node.id, { width: w, height: h })
  }

  graph.edges.forEach((edge, index) => {
    const source = ownerForNode(edge.source)
    const target = ownerForNode(edge.target)
    if (source === target) return
    if (!outerNodeIds.has(source) || !outerNodeIds.has(target)) return
    outer.setEdge(source, target, {}, `${edge.id}-${index}`)
  })

  dagre.layout(outer)

  const flowNodes: FlowNode[] = []
  for (const [groupId, groupLayout] of groupLayouts) {
    const outerNode = outer.node(outerIdForGroup(groupId))
    if (!outerNode) continue
    const groupTopLeft = {
      x: outerNode.x - groupLayout.width / 2,
      y: outerNode.y - groupLayout.height / 2,
    }

    for (const node of groupLayout.nodes) {
      flowNodes.push({
        ...node,
        position: {
          x: groupTopLeft.x + node.position.x,
          y: groupTopLeft.y + node.position.y,
        },
      })
    }
  }

  for (const node of graph.nodes) {
    if (nodeToGroup.has(node.id)) continue
    const pos = outer.node(node.id)
    if (!pos) continue
    const { w, h } = sizeForShape(node.shape, node.label, options, node.id)
    const customSize = Boolean(options.nodeSizes?.has(node.id))
    flowNodes.push({
      id: node.id,
      type: 'shape',
      data: { label: node.label, shape: node.shape ?? 'rect', customSize },
      position: { x: pos.x - w / 2, y: pos.y - h / 2 },
      width: w,
      height: h,
    })
  }

  const edges: FlowEdge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    ...(edge.label ? { label: edge.label } : {}),
  }))

  return { nodes: flowNodes, edges }
}

function boundsForNodes(nodes: FlowNode[]): {
  minX: number
  minY: number
  width: number
  height: number
} {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const node of nodes) {
    minX = Math.min(minX, node.position.x)
    minY = Math.min(minY, node.position.y)
    maxX = Math.max(maxX, node.position.x + (node.width ?? NODE_WIDTH))
    maxY = Math.max(maxY, node.position.y + (node.height ?? NODE_HEIGHT))
  }

  return { minX, minY, width: maxX - minX, height: maxY - minY }
}
