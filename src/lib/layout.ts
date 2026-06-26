import dagre from '@dagrejs/dagre'
import type { ParsedGraph, FlowGraph, FlowNode, FlowEdge } from './types'
import type { NodeSize } from './nodeSizeComments'

export const NODE_WIDTH = 160
export const NODE_HEIGHT = 44

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
