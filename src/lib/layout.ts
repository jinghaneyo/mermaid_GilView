import dagre from '@dagrejs/dagre'
import type { ParsedGraph, FlowGraph, FlowNode, FlowEdge } from './types'

export const NODE_WIDTH = 160
export const NODE_HEIGHT = 44

// 모양별 노드 크기(마름모/원통/원은 더 정사각형에 가깝게)
function sizeForShape(shape: string | undefined): { w: number; h: number } {
  switch (shape) {
    case 'diamond':
      return { w: 140, h: 84 }
    case 'cylinder':
      return { w: 120, h: 76 }
    case 'circle':
    case 'doublecircle':
      return { w: 92, h: 92 }
    case 'stadium':
    case 'round':
      return { w: 150, h: 46 }
    default:
      return { w: NODE_WIDTH, h: NODE_HEIGHT }
  }
}

export function layout(graph: ParsedGraph): FlowGraph {
  // multigraph: true is required to set named edges (preserves parallel edges)
  const g = new dagre.graphlib.Graph({ multigraph: true })
  g.setGraph({ rankdir: graph.direction, nodesep: 50, ranksep: 60 })
  g.setDefaultEdgeLabel(() => ({}))

  graph.nodes.forEach((n) => {
    const { w, h } = sizeForShape(n.shape)
    g.setNode(n.id, { width: w, height: h })
  })
  graph.edges.forEach((e) => {
    // pass the edge id as the dagre edge name so parallel edges aren't deduped
    g.setEdge(e.source, e.target, {}, e.id)
  })

  dagre.layout(g)

  const nodes: FlowNode[] = graph.nodes.map((n) => {
    const pos = g.node(n.id)
    const { w, h } = sizeForShape(n.shape)
    return {
      id: n.id,
      type: 'shape',
      data: { label: n.label, shape: n.shape ?? 'rect' },
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
