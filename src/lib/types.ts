export type Direction = 'TB' | 'BT' | 'LR' | 'RL'

export interface GraphNode {
  id: string
  label: string
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  label?: string
}

export interface ParsedGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  direction: Direction
}

// React Flow 호환 출력
export interface FlowNode {
  id: string
  data: { label: string }
  position: { x: number; y: number }
}

export interface FlowEdge {
  id: string
  source: string
  target: string
  label?: string
}

export interface FlowGraph {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

export interface ConvertResult {
  nodes: FlowNode[]
  edges: FlowEdge[]
  error: string | null
}
