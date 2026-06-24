import dagre from '@dagrejs/dagre'
import type { ParsedGraph, FlowGraph, FlowNode, FlowEdge } from './types'

const NODE_WIDTH = 160
const NODE_HEIGHT = 44

export function layout(graph: ParsedGraph): FlowGraph {
  // multigraph: true is required to set named edges (preserves parallel edges)
  const g = new dagre.graphlib.Graph({ multigraph: true })
  g.setGraph({ rankdir: graph.direction, nodesep: 50, ranksep: 60 })
  g.setDefaultEdgeLabel(() => ({}))

  graph.nodes.forEach((n) => {
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  })
  graph.edges.forEach((e) => {
    // pass the edge id as the dagre edge name so parallel edges aren't deduped
    g.setEdge(e.source, e.target, {}, e.id)
  })

  dagre.layout(g)

  const nodes: FlowNode[] = graph.nodes.map((n) => {
    const pos = g.node(n.id)
    return {
      id: n.id,
      data: { label: n.label },
      // dagre는 중심 좌표를 주므로 React Flow의 좌상단 좌표로 변환
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
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
